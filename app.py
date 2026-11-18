import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import finnhub
import firebase_admin
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import uvicorn
import yfinance as yf
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials, firestore
from google import genai
from google.genai import types
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field
from sklearn.preprocessing import MinMaxScaler
from transformers import AutoModelForSequenceClassification, AutoTokenizer

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("finai")

firebase_admin.initialize_app(credentials.Certificate(os.environ.get("FIREBASE_CREDENTIALS", "finai.json")))
db = firestore.client()

gemini = genai.Client(api_key=os.environ.get("GEMINI_KEY"))
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")

finnhub_client = finnhub.Client(api_key=os.environ.get("MARKET_KEY"))

app = FastAPI(title="FinAI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- auth

bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    """Verify the Firebase ID token sent by the client and return the user's uid."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        return firebase_auth.verify_id_token(creds.credentials)["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")


def user_doc(uid: str):
    return db.collection("users").document(uid)


# ---------------------------------------------------------------- market data

PRICE_TTL_SECONDS = 300
_price_cache: dict[str, tuple[float, float]] = {}


def normalize_symbol(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if not symbol or len(symbol) > 15 or not all(c.isalnum() or c in ".-^=" for c in symbol):
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")
    return symbol


def close_history(symbol: str, period: str) -> pd.Series:
    try:
        history = yf.Ticker(symbol).history(period=period)
    except Exception:
        log.exception("yfinance request failed for %s", symbol)
        raise HTTPException(status_code=502, detail="Couldn't reach the market data provider")
    closes = history["Close"].dropna() if "Close" in history else pd.Series(dtype=float)
    if closes.empty:
        raise HTTPException(status_code=404, detail=f"No price data found for {symbol}")
    return closes


def latest_price(symbol: str) -> float:
    cached = _price_cache.get(symbol)
    if cached and time.monotonic() - cached[1] < PRICE_TTL_SECONDS:
        return cached[0]
    price = float(close_history(symbol, "5d").iloc[-1])
    _price_cache[symbol] = (price, time.monotonic())
    return price


@app.get("/stock/{symbol}")
def stock_prices(symbol: str):
    symbol = normalize_symbol(symbol)
    closes = close_history(symbol, "1mo")
    return {
        "symbol": symbol,
        "prices": [{"date": ts.date().isoformat(), "close": round(float(c), 2)} for ts, c in closes.items()],
    }


# ---------------------------------------------------------------- transactions

class ParsedTransaction(BaseModel):
    amount: float = Field(description="Amount of money as a positive number, without currency symbols")
    type: Literal["debit", "credit"] = Field(description="debit for money spent, credit for money received")
    category: str = Field(description="Short category in Title Case, e.g. Groceries, Rent, Transport, Salary")
    note: str = Field(description="The part of the user's message that describes this transaction")


class ParsedMessage(BaseModel):
    intent: Literal["add_transactions", "view_expenses", "other"]
    transactions: list[ParsedTransaction]


CHAT_INSTRUCTIONS = """You read messages a user sends to their personal finance assistant.
- If the message records money spent or received, set intent to "add_transactions" and list every
  transaction it mentions, one entry per amount.
- If the message asks to see or summarise their spending, set intent to "view_expenses" and return
  no transactions.
- Otherwise set intent to "other" and return no transactions.
Never invent amounts that are not in the message."""

HELP_REPLY = (
    "I can record what you spend or earn (e.g. \"I spent $12 on lunch and got paid $2000\") "
    "or summarise this month's spending (\"show my expenses\")."
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def month_start() -> datetime:
    return datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def serialize_transaction(doc_id: str, data: dict) -> dict:
    return {**data, "id": doc_id, "timestamp": data["timestamp"].isoformat()}


def month_summary(uid: str) -> dict:
    docs = (
        user_doc(uid)
        .collection("transactions")
        .where(filter=FieldFilter("timestamp", ">=", month_start()))
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .stream()
    )
    transactions = [serialize_transaction(d.id, d.to_dict()) for d in docs]

    by_category: dict[str, float] = {}
    for t in transactions:
        if t["type"] == "debit":
            by_category[t["category"]] = by_category.get(t["category"], 0) + t["amount"]

    return {
        "month": month_start().strftime("%Y-%m"),
        "transactions": transactions,
        "by_category": [
            {"category": c, "total": round(v, 2)}
            for c, v in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "total_spent": round(sum(t["amount"] for t in transactions if t["type"] == "debit"), 2),
        "total_income": round(sum(t["amount"] for t in transactions if t["type"] == "credit"), 2),
    }


@app.get("/transactions")
def list_transactions(uid: str = Depends(current_user)):
    return month_summary(uid)


@app.post("/chat")
def chat(request: ChatRequest, uid: str = Depends(current_user)):
    try:
        response = gemini.models.generate_content(
            model=GEMINI_MODEL,
            contents=request.message,
            config=types.GenerateContentConfig(
                system_instruction=CHAT_INSTRUCTIONS,
                response_mime_type="application/json",
                response_schema=ParsedMessage,
                temperature=0,
            ),
        )
    except Exception:
        log.exception("Gemini request failed")
        raise HTTPException(status_code=502, detail="The assistant is unavailable right now. Please try again.")

    parsed = response.parsed
    if not isinstance(parsed, ParsedMessage):
        log.warning("Unparseable Gemini response: %r", response.text)
        raise HTTPException(status_code=502, detail="The assistant couldn't understand that. Try rephrasing.")

    user = user_doc(uid)
    now = datetime.now(timezone.utc)
    user.collection("chat_logs").add({"message": request.message, "response": response.text, "timestamp": now})

    if parsed.intent == "view_expenses":
        summary = month_summary(uid)
        top = ", ".join(f"{c['category']} ${c['total']:.2f}" for c in summary["by_category"][:3])
        reply = f"You've spent ${summary['total_spent']:.2f} so far this month"
        reply += f" (top categories: {top})." if top else "."
        return {"reply": reply, "transactions": []}

    transactions = [t for t in parsed.transactions if t.amount > 0] if parsed.intent == "add_transactions" else []
    if not transactions:
        return {"reply": HELP_REPLY, "transactions": []}

    batch = db.batch()
    saved = []
    for t in transactions:
        ref = user.collection("transactions").document()
        data = {**t.model_dump(), "timestamp": now}
        batch.set(ref, data)
        saved.append(serialize_transaction(ref.id, data))
    batch.commit()

    noun = "transaction" if len(saved) == 1 else "transactions"
    return {"reply": f"Recorded {len(saved)} {noun}.", "transactions": saved}


# ---------------------------------------------------------------- portfolio

class HoldingRequest(BaseModel):
    symbol: str
    amount_spent: float = Field(gt=0)
    purchase_price: float = Field(gt=0)


def holding_view(doc_id: str, data: dict) -> dict:
    """Value a holding at the latest market price (None if the price is unavailable)."""
    try:
        price = latest_price(data["symbol"])
    except HTTPException:
        price = None
    shares = data["amount_spent"] / data["purchase_price"]
    return {
        **data,
        "id": doc_id,
        "shares": shares,
        "current_price": price,
        "current_value": shares * price if price is not None else None,
        "gain_pct": (price - data["purchase_price"]) / data["purchase_price"] * 100 if price is not None else None,
    }


@app.get("/portfolio")
def list_holdings(uid: str = Depends(current_user)):
    docs = user_doc(uid).collection("holdings").stream()
    return [holding_view(d.id, d.to_dict()) for d in docs]


@app.post("/portfolio")
def add_holding(request: HoldingRequest, uid: str = Depends(current_user)):
    symbol = normalize_symbol(request.symbol)
    latest_price(symbol)  # rejects unknown tickers before saving
    data = {"symbol": symbol, "amount_spent": request.amount_spent, "purchase_price": request.purchase_price}
    _, ref = user_doc(uid).collection("holdings").add(data)
    return holding_view(ref.id, data)


@app.delete("/portfolio/{holding_id}", status_code=204)
def delete_holding(holding_id: str, uid: str = Depends(current_user)):
    ref = user_doc(uid).collection("holdings").document(holding_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Holding not found")
    ref.delete()


# ---------------------------------------------------------------- news sentiment

SENTIMENT_MODEL = "ProsusAI/finbert"
SENTIMENT_TTL = timedelta(hours=6)
sentiment_tokenizer = AutoTokenizer.from_pretrained(SENTIMENT_MODEL)
sentiment_model = AutoModelForSequenceClassification.from_pretrained(SENTIMENT_MODEL).eval()


class SentimentRequest(BaseModel):
    stock_symbol: str


def recent_headlines(symbol: str, limit: int = 15) -> list[str]:
    today = date.today()
    try:
        articles = finnhub_client.company_news(symbol, _from=(today - timedelta(days=30)).isoformat(), to=today.isoformat())
    except Exception:
        log.exception("Finnhub request failed for %s", symbol)
        raise HTTPException(status_code=502, detail=f"Couldn't fetch news for {symbol}")

    headlines: list[str] = []
    for article in sorted(articles, key=lambda a: a.get("datetime", 0), reverse=True):
        headline = (article.get("headline") or "").strip()
        if headline and headline not in headlines:
            headlines.append(headline)
        if len(headlines) == limit:
            break
    return headlines


def classify_headlines(headlines: list[str]) -> list[str]:
    inputs = sentiment_tokenizer(headlines, return_tensors="pt", truncation=True, padding=True, max_length=64)
    with torch.no_grad():
        logits = sentiment_model(**inputs).logits
    return [sentiment_model.config.id2label[i].lower() for i in logits.argmax(dim=1).tolist()]


@app.post("/analyze-sentiment")
def analyze_sentiment(request: SentimentRequest):
    symbol = normalize_symbol(request.stock_symbol)
    cache_ref = db.collection("sentiment_analysis").document(symbol)

    cached = cache_ref.get().to_dict()
    if cached and cached.get("model") == SENTIMENT_MODEL and datetime.now(timezone.utc) - cached["timestamp"] < SENTIMENT_TTL:
        return {**cached, "timestamp": cached["timestamp"].isoformat()}

    headlines = recent_headlines(symbol)
    labels = classify_headlines(headlines) if headlines else []
    counts = {label: labels.count(label) for label in ("positive", "neutral", "negative")}
    if not headlines:
        overall = None
    elif counts["positive"] > counts["negative"]:
        overall = "positive"
    elif counts["negative"] > counts["positive"]:
        overall = "negative"
    else:
        overall = "neutral"

    result = {
        "symbol": symbol,
        "overall": overall,
        "counts": counts,
        "headlines": [{"headline": h, "sentiment": s} for h, s in zip(headlines, labels)],
        "model": SENTIMENT_MODEL,
        "timestamp": datetime.now(timezone.utc),
    }
    cache_ref.set(result)
    return {**result, "timestamp": result["timestamp"].isoformat()}


# ---------------------------------------------------------------- price prediction

SEQUENCE_LENGTH = 10  # window length the LSTM was trained on
FORECAST_DAYS = 7


class LSTM(nn.Module):
    def __init__(self, input_dim, hidden_dim, num_layers, output_dim):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])


device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
lstm = LSTM(input_dim=1, hidden_dim=32, num_layers=2, output_dim=1).to(device)
lstm.load_state_dict(torch.load("model.pth", map_location=device, weights_only=True))
lstm.eval()


class StockRequest(BaseModel):
    ticker: str


@app.post("/predict")
def predict(request: StockRequest):
    symbol = normalize_symbol(request.ticker)
    closes = close_history(symbol, "1y")
    if len(closes) < SEQUENCE_LENGTH:
        raise HTTPException(status_code=404, detail=f"Not enough price history for {symbol}")

    # The scaler from training wasn't saved, so fit one on the past year of this ticker's prices.
    scaler = MinMaxScaler(feature_range=(-1, 1))
    scaled = scaler.fit_transform(closes.to_numpy().reshape(-1, 1))
    window = torch.tensor(scaled[-SEQUENCE_LENGTH:], dtype=torch.float32, device=device).unsqueeze(0)

    # Roll forward one trading day at a time, feeding each prediction back into the window.
    predicted = []
    with torch.no_grad():
        for _ in range(FORECAST_DAYS):
            step = lstm(window)
            predicted.append(step.item())
            window = torch.cat((window[:, 1:, :], step.view(1, 1, 1)), dim=1)

    prices = scaler.inverse_transform(np.array(predicted).reshape(-1, 1)).ravel()
    last_date = closes.index[-1].date()
    dates = pd.bdate_range(last_date + timedelta(days=1), periods=FORECAST_DAYS)
    return {
        "ticker": symbol,
        "last_close": round(float(closes.iloc[-1]), 2),
        "last_close_date": last_date.isoformat(),
        "predictions": [{"date": d.date().isoformat(), "price": round(float(p), 2)} for d, p in zip(dates, prices)],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

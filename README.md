# FinAI

Personal finance tracker with an AI chat for logging expenses, plus stock analysis (news sentiment and a price forecast).

- **Backend**: FastAPI (`app.py`), Firebase Admin (auth + Firestore), Gemini for parsing chat messages, FinBERT for news sentiment, a small LSTM (`model.pth`) for price forecasts.
- **Frontend**: React + Vite + Tailwind (`Client/`), Firebase Auth for sign-in.

## Setup

### Backend

```sh
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # then fill in the keys
python app.py                  # serves on http://localhost:8000
```

You need:

- `finai.json`: a Firebase service-account key (Firebase console → Project settings → Service accounts). Never commit it.
- `GEMINI_KEY`: a Gemini API key.
- `MARKET_KEY`: a Finnhub API key (used for company news).

The first start downloads the FinBERT model (~400 MB) from Hugging Face.

### Frontend

```sh
cd Client
npm install
cp .env.example .env.local     # then fill in your Firebase web app config
npm run dev                    # http://localhost:5173
```

## How auth and data work

The frontend signs users in with Firebase Auth and sends the user's ID token as a `Bearer` token on every API call. The backend verifies the token and stores data per user in Firestore:

```
users/{uid}/transactions/{id}   amount, type (debit|credit), category, note, timestamp
users/{uid}/holdings/{id}       symbol, amount_spent, purchase_price
users/{uid}/chat_logs/{id}
sentiment_analysis/{symbol}     shared 6-hour cache of news sentiment
```

The browser never reads or writes Firestore directly, so Firestore security rules can deny all client access:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/chat` | ✓ | Parse a message; records transactions or summarises the month |
| GET | `/transactions` | ✓ | This month's transactions and per-category totals |
| GET/POST | `/portfolio` | ✓ | List holdings (valued at the latest price) / add one |
| DELETE | `/portfolio/{id}` | ✓ | Remove a holding |
| GET | `/stock/{symbol}` | | One month of closing prices |
| POST | `/analyze-sentiment` | | FinBERT sentiment of the latest news headlines |
| POST | `/predict` | | 7-trading-day LSTM forecast (experimental) |

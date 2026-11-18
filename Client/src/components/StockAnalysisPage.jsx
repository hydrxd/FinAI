import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { api } from '../api';

const SENTIMENT_COLORS = { positive: 'text-green-400', negative: 'text-red-400', neutral: 'text-gray-300' };

const formatDay = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// Runs `request` whenever `deps` change and tracks its result, error and loading state.
// Requests superseded by a newer one (e.g. after navigating to another symbol) are aborted.
function useApi(request, deps) {
  const [state, setState] = useState({ data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null });
    request(controller.signal)
      .then((data) => setState({ data, error: null }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ data: null, error: err.message });
      });
    return () => controller.abort();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

const StockAnalysisPage = () => {
  const { symbol } = useParams();

  const prediction = useApi(
    (signal) => api('/predict', { method: 'POST', body: { ticker: symbol }, signal }),
    [symbol],
  );
  const sentiment = useApi(
    (signal) => api('/analyze-sentiment', { method: 'POST', body: { stock_symbol: symbol }, signal }),
    [symbol],
  );
  const prices = useApi((signal) => api(`/stock/${encodeURIComponent(symbol)}`, { signal }), [symbol]);

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      <h2 className="text-4xl font-bold mb-6">Stock Analysis for {symbol}</h2>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        {/* LSTM Predictions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">Predictions for the Next 7 Trading Days</h2>
          <p className="text-gray-400 text-sm mb-4">Experimental model output. Not financial advice.</p>
          {prediction.error ? (
            <p className="text-red-400 text-lg">{prediction.error}</p>
          ) : !prediction.data ? (
            <p className="text-yellow-400 text-lg">Loading predictions...</p>
          ) : (
            <>
              <p className="text-gray-300 mb-2">
                Last close ({formatDay(prediction.data.last_close_date)}): ${prediction.data.last_close.toFixed(2)}
              </p>
              <ul className="space-y-2">
                {prediction.data.predictions.map((p) => (
                  <li key={p.date} className="flex items-center text-lg text-green-400">
                    <span className="mr-2 text-gray-300 w-32">{formatDay(p.date)}:</span>
                    <span className="font-semibold">${p.price.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Sentiment Analysis */}
        <div className="border-t border-gray-600 pt-6">
          <h2 className="text-2xl font-bold text-white mb-4">News Sentiment</h2>
          {sentiment.error ? (
            <p className="text-red-400 text-lg">{sentiment.error}</p>
          ) : !sentiment.data ? (
            <p className="text-yellow-400 text-lg">Loading sentiment...</p>
          ) : !sentiment.data.overall ? (
            <p className="text-gray-300 text-lg">No news about {symbol} in the last 30 days.</p>
          ) : (
            <>
              <p className={`text-lg font-semibold capitalize ${SENTIMENT_COLORS[sentiment.data.overall]}`}>
                {sentiment.data.overall}
              </p>
              <p className="text-gray-400 mb-4">
                {sentiment.data.counts.positive} positive · {sentiment.data.counts.neutral} neutral ·{' '}
                {sentiment.data.counts.negative} negative, from the {sentiment.data.headlines.length} latest headlines
              </p>
              <ul className="space-y-1 text-sm">
                {sentiment.data.headlines.map((h) => (
                  <li key={h.headline}>
                    <span className={`capitalize mr-2 ${SENTIMENT_COLORS[h.sentiment]}`}>{h.sentiment}</span>
                    {h.headline}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded shadow-md mt-6">
        <h3 className="text-2xl mb-4 text-white">Stock Price Chart (1 month)</h3>
        {prices.error ? (
          <p className="text-red-400 text-lg">{prices.error}</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={prices.data?.prices ?? []}>
              <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: '#fff' }} axisLine={{ stroke: '#fff' }} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#fff' }} axisLine={{ stroke: '#fff' }} />
              <Tooltip labelFormatter={formatDay} formatter={(value) => [`$${value.toFixed(2)}`, 'Close']} />
              <CartesianGrid stroke="#ccc" />
              <Line type="monotone" dataKey="close" stroke="#82ca9d" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default StockAnalysisPage;

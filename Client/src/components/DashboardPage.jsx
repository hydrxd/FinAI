import { useEffect, useState } from 'react';
import { PieChart, Pie, Tooltip, Cell, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';

const COLORS = ['#FF8042', '#00C49F', '#FFBB28', '#0088FE', '#FF4560'];

const money = (value) => (value == null ? '—' : `$${value.toFixed(2)}`);

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Stock portfolio state
  const [holdings, setHoldings] = useState(null);
  const [holdingsError, setHoldingsError] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [amountSpent, setAmountSpent] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api('/transactions')
      .then(setSummary)
      .catch((err) => setSummaryError(err.message));
    api('/portfolio')
      .then(setHoldings)
      .catch((err) => setHoldingsError(err.message));
  }, []);

  const chartData = summary?.by_category.map((c) => ({ name: c.category, value: c.total })) ?? [];
  const monthLabel = summary
    ? new Date(`${summary.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const handleCategoryClick = (data) => {
    const category = data.name;
    const transactions = summary.transactions.filter((t) => t.type === 'debit' && t.category === category);
    setSelectedCategory({ category, transactions });
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const holding = await api('/portfolio', {
        method: 'POST',
        body: { symbol, amount_spent: parseFloat(amountSpent), purchase_price: parseFloat(purchasePrice) },
      });
      setHoldings((prev) => [...(prev ?? []), holding]);
      setMessage({ text: `Stock ${holding.symbol} added successfully!`, isError: false });
      setSymbol('');
      setAmountSpent('');
      setPurchasePrice('');
    } catch (err) {
      setMessage({ text: err.message, isError: true });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteStock = async (id) => {
    if (!window.confirm('Are you sure you want to delete this stock?')) return;
    try {
      await api(`/portfolio/${id}`, { method: 'DELETE' });
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      setMessage({ text: 'Stock deleted successfully!', isError: false });
    } catch (err) {
      setMessage({ text: err.message, isError: true });
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      <h2 className="text-4xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-6 rounded shadow-md">
          <h3 className="text-2xl font-bold mb-1">Expenses</h3>
          {monthLabel && <p className="text-gray-400 mb-4">{monthLabel}</p>}
          {summaryError ? (
            <p className="text-red-400">{summaryError}</p>
          ) : !summary ? (
            <p className="text-yellow-400">Loading...</p>
          ) : summary.by_category.length === 0 ? (
            <p className="text-gray-400">No expenses yet this month. Add some from the Chat page.</p>
          ) : (
            <>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-gray-600 p-2">Category</th>
                    <th className="border-b border-gray-600 p-2">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_category.map((c) => (
                    <tr key={c.category} className="hover:bg-gray-700">
                      <td className="border-b border-gray-600 p-2 text-yellow-400">{c.category}</td>
                      <td className="border-b border-gray-600 p-2">{money(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between mt-4 font-semibold">
                <span>Spent: <span className="text-red-300">{money(summary.total_spent)}</span></span>
                <span>Income: <span className="text-green-400">{money(summary.total_income)}</span></span>
              </div>
            </>
          )}
        </div>
        <div className="bg-gray-800 p-6 rounded shadow-md">
          <h3 className="text-2xl font-bold mb-4 ">Stock Portfolio</h3>
          <form onSubmit={handleAddStock} className="mb-4">
            <input
              type="text"
              placeholder="Stock Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="p-2 rounded border border-gray-600 bg-gray-700 mb-2 w-full"
              required
            />
            <input
              type="number"
              min="0.01"
              step="any"
              placeholder="Amount Spent"
              value={amountSpent}
              onChange={(e) => setAmountSpent(e.target.value)}
              className="p-2 rounded border border-gray-600 bg-gray-700 mb-2 w-full"
              required
            />
            <input
              type="number"
              min="0.01"
              step="any"
              placeholder="Purchase Price (per share)"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="p-2 rounded border border-gray-600 bg-gray-700 mb-4 w-full"
              required
            />
            <button
              type="submit"
              disabled={adding}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Stock'}
            </button>
          </form>
          {message && <p className={message.isError ? 'text-red-400' : 'text-green-400'}>{message.text}</p>}
          {holdingsError ? (
            <p className="text-red-400 mt-4">{holdingsError}</p>
          ) : !holdings ? (
            <p className="text-yellow-400 mt-4">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse mt-4">
                <thead>
                  <tr>
                    <th className="border-b border-gray-600 p-2">Symbol</th>
                    <th className="border-b border-gray-600 p-2">Amount Spent</th>
                    <th className="border-b border-gray-600 p-2">Purchase Price</th>
                    <th className="border-b border-gray-600 p-2">Current Value</th>
                    <th className="border-b border-gray-600 p-2">Gains (%)</th>
                    <th className="border-b border-gray-600 p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-700">
                      <td className="border-b border-gray-600 p-2 text-yellow-400">{h.symbol}</td>
                      <td className="border-b border-gray-600 p-2">{money(h.amount_spent)}</td>
                      <td className="border-b border-gray-600 p-2">{money(h.purchase_price)}</td>
                      <td className="border-b border-gray-600 p-2">{money(h.current_value)}</td>
                      <td
                        className={`border-b border-gray-600 p-2 ${
                          h.gain_pct == null ? '' : h.gain_pct >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {h.gain_pct == null ? '—' : `${h.gain_pct.toFixed(2)}%`}
                      </td>
                      <td className="border-b border-gray-600 p-2">
                        <button onClick={() => handleDeleteStock(h.id)} className="text-red-500 hover:text-red-600">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {chartData.length > 0 && (
        <div className="bg-gray-800 p-6 rounded shadow-md mt-6 w-full">
          <h3 className="text-2xl font-bold mb-4 text-center">Expense Distribution</h3>
          <p className="text-gray-400 text-center">Click a slice to see its transactions.</p>
          <div style={{ padding: '20px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  onClick={handleCategoryClick}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {selectedCategory && (
        <div className="mt-8 bg-gray-800 p-6 rounded shadow-md">
          <h3 className="text-2xl font-bold mb-4">
            Transactions for <span className="text-yellow-400">{selectedCategory.category}</span>
          </h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="border-b border-gray-600 p-2">Date & Time</th>
                <th className="border-b border-gray-600 p-2">Amount</th>
                <th className="border-b border-gray-600 p-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {selectedCategory.transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-700">
                  <td className="border-b border-gray-600 p-2">
                    {new Date(t.timestamp).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="border-b border-gray-600 p-2">{money(t.amount)}</td>
                  <td className="border-b border-gray-600 p-2">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;

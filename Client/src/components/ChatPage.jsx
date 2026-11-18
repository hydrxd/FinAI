import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const ChatPage = () => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hello! Tell me what you spent or earned, or ask to see your expenses.' },
  ]);
  const listRef = useRef(null);

  useEffect(() => {
    // Scroll only the message list; scrollIntoView would also scroll the page.
    const list = listRef.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setMessage('');
    setSending(true);
    try {
      const data = await api('/chat', { method: 'POST', body: { message: text } });
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply, transactions: data.transactions }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'bot', text: error.message, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-6 flex flex-col">
      <h2 className="text-4xl font-bold mb-6 text-center">Chat with FinBot</h2>
      <div ref={listRef} className="border border-gray-700 rounded-lg p-4 mb-6 h-96 overflow-y-auto bg-gray-800 shadow-lg flex flex-col">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 p-2 rounded max-w-[80%] ${
              msg.role === 'user' ? 'bg-blue-700 self-end' : msg.isError ? 'bg-red-900 self-start' : 'bg-gray-700 self-start'
            }`}
          >
            <p>{msg.text}</p>
            {msg.transactions?.length > 0 && (
              <table className="w-full text-left mt-2 text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-600 p-1">Amount</th>
                    <th className="border-b border-gray-600 p-1">Type</th>
                    <th className="border-b border-gray-600 p-1">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {msg.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="border-b border-gray-600 p-1">${t.amount.toFixed(2)}</td>
                      <td className={`border-b border-gray-600 p-1 ${t.type === 'credit' ? 'text-green-400' : 'text-red-300'}`}>
                        {t.type === 'credit' ? 'Income' : 'Expense'}
                      </td>
                      <td className="border-b border-gray-600 p-1">{t.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {sending && <p className="text-gray-400 self-start p-2">FinBot is thinking...</p>}
      </div>
      <form onSubmit={handleSend} className="flex items-center">
        <input
          className="flex-grow bg-gray-700 border border-gray-600 p-3 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. I spent $40 on groceries and $15 on a taxi"
        />
        <button
          type="submit"
          disabled={sending}
          className="bg-blue-600 px-6 py-3 ml-3 rounded-lg text-white hover:bg-blue-500 transition duration-300 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPage;

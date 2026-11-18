import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="text-gray-400 text-center p-10">Loading...</p>;
  }
  // Remember where the user was headed so Login can send them back there.
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default ProtectedRoute;

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import API_ENDPOINT from '../lib/apiConfig';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const onFocus = () => {
      fetchUser({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token]);

  const fetchUser = async ({ silent = false } = {}) => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/auth/me`);
      setUser(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      if (!silent) logout();
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  /** Reload permissions from DB (e.g. after Admin updates a role). */
  const refreshUser = async () => {
    if (!token) return null;
    return fetchUser({ silent: true });
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API_ENDPOINT}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    // Enrich with permissions and is_admin from /auth/me
    await fetchUser({ silent: true });
  };

  const register = async (email, password, name, employee_id, role) => {
    const response = await axios.post(`${API_ENDPOINT}/auth/register`, { email, password, name, employee_id, role });
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const checkTodayWorkLog = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/daily-work-logs/check-today`);
      return response.data;
    } catch (error) {
      console.error('Failed to check work log:', error);
      return { has_logged_today: false };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, refreshUser, checkTodayWorkLog }}>
      {children}
    </AuthContext.Provider>
  );
};
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000/api';

export async function testAPI() {
  try {
    const res = await axios.get(`${API_BASE}/test`);
    return res.data;
  } catch (err) {
    console.error('Error conectando con API:', err);
    return null;
  }
}
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'evo_secret';

// Usuario de ejemplo (puedes cambiarlo por consulta a base de datos)
const USER = {
  email: 'admin@evo.com',
  password: 'admin123',
  name: 'Administrador'
};

exports.login = (req, res) => {
  const { email, password } = req.body;
  if (email === USER.email && password === USER.password) {
    const token = jwt.sign({ email: USER.email, name: USER.name }, SECRET, { expiresIn: '1d' });
    return res.json({ token, user: { email: USER.email, name: USER.name } });
  }
  return res.status(401).json({ error: 'Credenciales inválidas' });
}; 
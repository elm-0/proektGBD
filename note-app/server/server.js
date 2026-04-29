import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import dns from "node:dns/promises";

dns.setServers(["1.1.1.1"]);

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600
  }),
  cookie: {
    secure: false, //true to use HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'lax'
  }
}));

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Atlas connected successfully');
  } catch (error) {
    console.error('MongoDB Atlas connection error:', error);
    process.exit(1);
  }
};

connectDB();

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String },
  notes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }]
});

const noteSchema = new mongoose.Schema({
  user: { type: String, required: true },
  date_added: { type: Date, required: true },
  date_modified: { type: Date, required: true },
  modified_by: { type: String, required: true },
  title: { type: String },
  text: { type: String },
  tags: [{ type: String }],
  shared_with: [{ type: String }]
});

const User = mongoose.model('User', userSchema);
const Note = mongoose.model('Note', noteSchema);

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      email
    });
    
    await user.save();
    res.json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user._id;
    req.session.username = user.username;
    
    res.json({ 
      message: 'Logged in successfully',
      username: user.username,
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create note
app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const { title, text, tags } = req.body;
    const now = new Date();
    
    const note = new Note({
      user: req.session.username,
      date_added: now,
      date_modified: now,
      modified_by: req.session.username,
      title,
      text,
      tags: tags || [],
      shared_with: []
    });
    
    await note.save();
    
    await User.findByIdAndUpdate(req.session.userId, {
      $push: { notes: note._id }
    });
    
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all notes
app.get('/api/notes', requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({
      $or: [
        { user: req.session.username },
        { shared_with: req.session.username }
      ]
    }).sort({ date_modified: -1 });
    
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single note
app.get('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (note.user !== req.session.username && !note.shared_with.includes(req.session.username)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note
app.put('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const { title, text, tags } = req.body;
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (note.user !== req.session.username && !note.shared_with.includes(req.session.username)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    note.title = title;
    note.text = text;
    note.tags = tags || [];
    note.date_modified = new Date();
    note.modified_by = req.session.username;
    
    await note.save();
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note
app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (note.user !== req.session.username) {
      return res.status(403).json({ error: 'Only the owner can delete notes' });
    }
    
    await Note.deleteOne({ _id: req.params.id });
    await User.findByIdAndUpdate(req.session.userId, {
      $pull: { notes: req.params.id }
    });
    
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Share note
app.post('/api/notes/:id/share', requireAuth, async (req, res) => {
  try {
    const { username } = req.body;
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (note.user !== req.session.username) {
      return res.status(403).json({ error: 'Only the owner can share notes' });
    }
    
    const userToShare = await User.findOne({ username });
    if (!userToShare) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!note.shared_with.includes(username)) {
      note.shared_with.push(username);
      await note.save();
    }
    
    res.json({ message: `Note shared with ${username}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unshare note
app.delete('/api/notes/:id/share/:username', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (note.user !== req.session.username) {
      return res.status(403).json({ error: 'Only the owner can unshare notes' });
    }
    
    note.shared_with = note.shared_with.filter(u => u !== req.params.username);
    await note.save();
    
    res.json({ message: `Note unshared with ${req.params.username}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search notes
app.get('/api/notes/search/:query', requireAuth, async (req, res) => {
  try {
    const searchQuery = req.params.query;
    const notes = await Note.find({
      $and: [
        {
          $or: [
            { user: req.session.username },
            { shared_with: req.session.username }
          ]
        },
        {
          $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { text: { $regex: searchQuery, $options: 'i' } },
            { tags: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      ]
    }).sort({ date_modified: -1 });
    
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all unique tags for current user
app.get('/api/tags', requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({
      $or: [
        { user: req.session.username },
        { shared_with: req.session.username }
      ]
    });
    
    const allTags = new Set();
    notes.forEach(note => {
      note.tags.forEach(tag => {
        allTags.add(tag);
      });
    });
    
    res.json(Array.from(allTags).sort());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notes by tag
app.get('/api/notes/tag/:tag', requireAuth, async (req, res) => {
  try {
    const tag = req.params.tag;
    const notes = await Note.find({
      $and: [
        {
          $or: [
            { user: req.session.username },
            { shared_with: req.session.username }
          ]
        },
        { tags: tag }
      ]
    }).sort({ date_modified: -1 });
    
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API test endpoint: http://localhost:${PORT}/api/test`);
});
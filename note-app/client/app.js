const API_URL = 'http://localhost:5000/api';

let currentUser = null;
let currentNote = null;
let editingNoteId = null;
let currentTagFilter = null;

async function apiCall(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function testServerConnection() {
    try {
        const result = await apiCall('/test');
        console.log('Server connection test:', result);
        return true;
    } catch (error) {
        console.error('Cannot connect to server:', error);
        alert('Cannot connect to server. Make sure the backend is running on http://localhost:5000');
        return false;
    }
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const email = document.getElementById('regEmail').value;
    
    if (!username || !password) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        await apiCall('/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, email })
        });
        alert('Registration successful! Please login.');
        showLogin();
    } catch (error) {
        alert('Registration failed');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }
    
    try {
        const data = await apiCall('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        currentUser = data;
        await loadApp();
    } catch (error) {
        alert('Login failed');
    }
}

async function logout() {
    try {
        await apiCall('/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    }
    currentUser = null;
    currentTagFilter = null;
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

function showLogin() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
}

async function loadTags() {
    try {
        const tags = await apiCall('/tags');
        displayTags(tags);
    } catch (error) {
        console.error('Error loading tags:', error);
    }
}

function displayTags(tags) {
    const tagsContainer = document.getElementById('tagsList');
    if (!tags || tags.length === 0) {
        tagsContainer.innerHTML = '<p style="color: #999;">No tags yet!</p>';
        return;
    }
    
    tagsContainer.innerHTML = tags.map(tag => `
        <div class="tag-chip ${currentTagFilter === tag ? 'active' : ''}" onclick="filterByTag('${tag}')">
            ${escapeHtml(tag)}
        </div>
    `).join('');
}

async function filterByTag(tag) {
    currentTagFilter = tag;
    try {
        const notes = await apiCall(`/notes/tag/${encodeURIComponent(tag)}`);
        displayNotes(notes);
        await loadTags();
    } catch (error) {
        alert('Error filtering notes');
    }
}

async function clearTagFilter() {
    currentTagFilter = null;
    await loadNotes();
    await loadTags();
}

function parseTags(tagsString) {
    if (!tagsString.trim()) return [];
    return tagsString.split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);
}

function updateTagsPreview(tagsString) {
    const tags = parseTags(tagsString);
    const preview = document.getElementById('tagsPreview');
    if (tags.length === 0) {
        preview.innerHTML = '';
        return;
    }
    
    preview.innerHTML = tags.map(tag => `
        <span class="tag-preview">${escapeHtml(tag)}</span>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const tagsInput = document.getElementById('noteTags');
    if (tagsInput) {
        tagsInput.addEventListener('input', (e) => {
            updateTagsPreview(e.target.value);
        });
    }
});

async function loadApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('currentUser').textContent = `Welcome!`;
    await loadNotes();
    await loadTags();
}

async function loadNotes() {
    try {
        let notes;
        if (currentTagFilter) {
            notes = await apiCall(`/notes/tag/${encodeURIComponent(currentTagFilter)}`);
        } else {
            notes = await apiCall('/notes');
        }
        displayNotes(notes);
    } catch (error) {
        console.error('Error loading notes:', error);
        alert('Error loading notes');
    }
}

function displayNotes(notes) {
    const grid = document.getElementById('notesGrid');
    if (!notes || notes.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: white;">No notes found. Click "Create New Note" to get started!</p>';
        return;
    }
    
    grid.innerHTML = notes.map(note => `
        <div class="note-card" onclick="openNote('${note._id}')">
            <div class="note-title">${escapeHtml(note.title || 'Untitled')}</div>
            <div class="note-preview">${escapeHtml((note.text || '').substring(0, 150))}</div>
            ${note.tags && note.tags.length > 0 ? `
                <div class="note-tags">
                    ${note.tags.map(tag => `<span class="note-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="note-meta">
                Modified: ${new Date(note.date_modified).toLocaleDateString()}<br>
                By: ${note.modified_by}
                ${note.user !== currentUser.username ? '<br><span class="shared-badge">Shared with you</span>' : ''}
            </div>
        </div>
    `).join('');
}

async function searchNotes() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        currentTagFilter = null;
        await loadNotes();
        await loadTags();
        return;
    }
    
    try {
        const notes = await apiCall(`/notes/search/${encodeURIComponent(query)}`);
        displayNotes(notes);
        currentTagFilter = null;
        await loadTags();
    } catch (error) {
        alert('Error searching notes');
    }
}

async function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentTagFilter = null;
    await loadNotes();
    await loadTags();
}

async function openNote(noteId) {
    try {
        const note = await apiCall(`/notes/${noteId}`);
        currentNote = note;
        editingNoteId = noteId;
        
        document.getElementById('modalTitle').textContent = note.user === currentUser.username ? 'Edit Note' : 'View Note';
        document.getElementById('noteTitle').value = note.title || '';
        document.getElementById('noteText').value = note.text || '';
        document.getElementById('noteTags').value = (note.tags || []).join(', ');
        updateTagsPreview((note.tags || []).join(', '));
        
        const shareSection = document.getElementById('shareSection');
        const deleteBtn = document.getElementById('deleteBtn');
        
        if (note.user === currentUser.username) {
            shareSection.style.display = 'block';
            deleteBtn.style.display = 'inline-block';
            displaySharedUsers(note.shared_with || []);
        } else {
            shareSection.style.display = 'none';
            deleteBtn.style.display = 'none';
        }
        
        document.getElementById('noteModal').style.display = 'block';
    } catch (error) {
        alert('Error opening note');
    }
}

function displaySharedUsers(sharedUsers) {
    const container = document.getElementById('sharedUsers');
    if (!sharedUsers || sharedUsers.length === 0) {
        container.innerHTML = '<p>Not shared with anyone</p>';
        return;
    }
    
    container.innerHTML = sharedUsers.map(username => `
        <div class="shared-user">
            ${escapeHtml(username)}
            <button onclick="unshareNote('${username}')">×</button>
        </div>
    `).join('');
}

async function shareNote() {
    const username = document.getElementById('shareUsername').value.trim();
    if (!username) {
        alert('Please enter a username');
        return;
    }
    
    try {
        await apiCall(`/notes/${editingNoteId}/share`, {
            method: 'POST',
            body: JSON.stringify({ username })
        });
        alert(`Note shared with ${username}`);
        document.getElementById('shareUsername').value = '';
        const note = await apiCall(`/notes/${editingNoteId}`);
        displaySharedUsers(note.shared_with || []);
    } catch (error) {
        alert('Error sharing note');
    }
}

async function unshareNote(username) {
    if (!confirm(`Remove ${username} from sharing this note?`)) return;
    
    try {
        await apiCall(`/notes/${editingNoteId}/share/${username}`, {
            method: 'DELETE'
        });
        alert(`Note unshared with ${username}`);
        const note = await apiCall(`/notes/${editingNoteId}`);
        displaySharedUsers(note.shared_with || []);
    } catch (error) {
        alert('Error unsharing note');
    }
}

async function saveNote() {
    const title = document.getElementById('noteTitle').value;
    const text = document.getElementById('noteText').value;
    const tagsString = document.getElementById('noteTags').value;
    const tags = parseTags(tagsString);
    
    try {
        if (editingNoteId) {
            await apiCall(`/notes/${editingNoteId}`, {
                method: 'PUT',
                body: JSON.stringify({ title, text, tags })
            });
            alert('Note updated successfully');
        } else {
            await apiCall('/notes', {
                method: 'POST',
                body: JSON.stringify({ title, text, tags })
            });
            alert('Note created successfully');
        }
        
        closeModal();
        await loadNotes();
        await loadTags();
    } catch (error) {
        alert('Error saving note');
    }
}

async function deleteNote() {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) return;
    
    try {
        await apiCall(`/notes/${editingNoteId}`, { method: 'DELETE' });
        alert('Note deleted successfully');
        closeModal();
        await loadNotes();
        await loadTags();
    } catch (error) {
        alert('Error deleting note');
    }
}

function showCreateModal() {
    editingNoteId = null;
    currentNote = null;
    document.getElementById('modalTitle').textContent = 'Create Note';
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteText').value = '';
    document.getElementById('noteTags').value = '';
    document.getElementById('tagsPreview').innerHTML = '';
    document.getElementById('shareSection').style.display = 'none';
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('noteModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('noteModal').style.display = 'none';
    editingNoteId = null;
    currentNote = null;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check if user is already logged in on page load
async function checkAuth() {
    const isServerRunning = await testServerConnection();
    if (!isServerRunning) {
        document.getElementById('authContainer').style.display = 'block';
        document.getElementById('appContainer').style.display = 'none';
        return;
    }
    
    try {
        const user = await apiCall('/me');
        currentUser = user;
        await loadApp();
    } catch (error) {
        console.log('Not authenticated, showing login form');
        document.getElementById('authContainer').style.display = 'block';
        document.getElementById('appContainer').style.display = 'none';
    }
}

checkAuth();
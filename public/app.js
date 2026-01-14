/**
 * JIT Intelligence - Frontend Application
 * Premium B2B Intelligence Platform
 */

// ============================================
// Tab Navigation
// ============================================

function switchTab(tab) {
    const corpSearch = document.getElementById('corp-search');
    const smbSearch = document.getElementById('smb-search');
    const tabCorp = document.getElementById('tab-corp');
    const tabSmb = document.getElementById('tab-smb');

    if (tab === 'corp') {
        corpSearch.classList.remove('hidden');
        smbSearch.classList.add('hidden');
        tabCorp.classList.add('active');
        tabSmb.classList.remove('active');
    } else {
        corpSearch.classList.add('hidden');
        smbSearch.classList.remove('hidden');
        tabCorp.classList.remove('active');
        tabSmb.classList.add('active');
    }

    // Clear results when switching tabs
    clearResults();
}

function clearResults() {
    const container = document.getElementById('results-container');
    const header = document.getElementById('results-header');
    container.innerHTML = '';
    header.classList.add('hidden');
}

// ============================================
// Search Functionality
// ============================================

async function performSearch() {
    const activeTab = document.querySelector('.tab-btn.active').id;
    const isCorp = activeTab === 'tab-corp';
    const container = document.getElementById('results-container');
    const header = document.getElementById('results-header');
    const countEl = document.getElementById('results-count');
    const searchBtn = isCorp
        ? document.getElementById('corp-search-btn')
        : document.getElementById('smb-search-btn');

    let payload = {};

    if (isCorp) {
        const role = document.getElementById('role-input').value.trim();
        const company = document.getElementById('company-input').value.trim();
        if (!role || !company) {
            showNotification('Please enter both Job Title and Company', 'error');
            return;
        }
        payload = { type: 'corp', role, company };
    } else {
        const businessType = document.getElementById('business-input').value.trim();
        const location = document.getElementById('location-input').value.trim();
        if (!businessType || !location) {
            showNotification('Please enter both Business Type and Location', 'error');
            return;
        }
        payload = { type: 'smb', businessType, location };
    }

    // Show loading state
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="icon">⏳</span><span>Searching...</span>';
    header.classList.add('hidden');
    container.innerHTML = renderLoadingState();

    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const results = await response.json();

        // Update header
        header.classList.remove('hidden');
        countEl.textContent = `${results.length} found`;

        if (results.length === 0) {
            container.innerHTML = renderEmptyState(isCorp);
            return;
        }

        renderResults(results, container, isCorp);

    } catch (err) {
        console.error('Search error:', err);
        container.innerHTML = renderErrorState(err.message);
    } finally {
        // Reset button
        searchBtn.disabled = false;
        searchBtn.innerHTML = isCorp
            ? '<span class="icon">🔍</span><span>Find Professionals</span>'
            : '<span class="icon">📍</span><span>Find Local Businesses</span>';
    }
}

// ============================================
// Rendering Functions
// ============================================

function renderLoadingState() {
    return `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Scanning Live Sources...</div>
            <div class="loading-subtext">This may take a few seconds</div>
        </div>
    `;
}

function renderEmptyState(isCorp) {
    const icon = isCorp ? '👤' : '🏢';
    const title = isCorp ? 'No professionals found' : 'No businesses found';
    const text = isCorp
        ? 'Try adjusting your search terms or try a different company'
        : 'Try a different business type or expand your location';

    return `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <h3 class="empty-title">${title}</h3>
            <p class="empty-text">${text}</p>
        </div>
    `;
}

function renderErrorState(message) {
    return `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <div class="error-text">Search failed: ${escapeHtml(message)}</div>
        </div>
    `;
}

function renderResults(profiles, container, isCorp) {
    container.innerHTML = '';

    profiles.forEach((profile, index) => {
        const card = document.createElement('div');
        card.className = 'result-card animate-fade-in';
        card.style.animationDelay = `${index * 0.05}s`;
        card.onclick = () => openModal(profile, isCorp);

        // Determine avatar
        let avatarContent = isCorp ? '👤' : '🏢';
        let avatarClass = isCorp ? '' : 'business';
        if (profile.imageUrl) {
            avatarContent = `<img src="${escapeHtml(profile.imageUrl)}" alt="${escapeHtml(profile.name)}" onerror="this.parentElement.innerHTML='👤'">`;
        }

        // Email/contact display
        const email = profile.email || 'Not found';
        const phone = profile.phone || '';

        // Status badge
        const statusClass = getStatusClass(profile.emailStatus);
        const statusText = profile.emailStatus || 'unknown';

        // Source badge
        const source = profile.raw_data?.source || profile.source || '';

        // Truncate headline
        const headline = profile.headline || profile.address || '';
        const truncatedHeadline = headline.length > 120
            ? headline.substring(0, 120) + '...'
            : headline;

        card.innerHTML = `
            <div class="result-card-inner">
                <div class="result-avatar ${avatarClass}">
                    ${avatarContent}
                </div>
                <div class="result-content">
                    <div class="result-header">
                        <h3 class="result-name">${escapeHtml(profile.name)}</h3>
                        <div class="result-badges">
                            <span class="badge ${statusClass}">${statusText}</span>
                            ${source ? `<span class="badge badge-source">${escapeHtml(source)}</span>` : ''}
                        </div>
                    </div>
                    <p class="result-headline">${escapeHtml(truncatedHeadline)}</p>
                    <div class="result-meta">
                        <span class="result-email">
                            <span>📧</span>
                            <span>${escapeHtml(email)}</span>
                        </span>
                        ${phone ? `
                            <span class="result-phone">
                                <span>📞</span>
                                <span>${escapeHtml(phone)}</span>
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function getStatusClass(status) {
    switch (status) {
        case 'valid': return 'badge-valid';
        case 'risky': return 'badge-risky';
        case 'invalid': return 'badge-invalid';
        default: return 'badge-unknown';
    }
}

// ============================================
// Modal Functions
// ============================================

function openModal(profile, isCorp = true) {
    const modal = document.getElementById('profile-modal');
    const avatarEl = document.getElementById('modal-avatar');
    const nameEl = document.getElementById('modal-name');
    const headlineEl = document.getElementById('modal-headline');
    const contactEl = document.getElementById('modal-contact-info');
    const detailsEl = document.getElementById('modal-details-info');
    const detailsSection = document.getElementById('modal-details-section');
    const rawDataEl = document.getElementById('modal-raw-data');

    // Set name and headline
    nameEl.textContent = profile.name;
    headlineEl.textContent = profile.headline || profile.address || 'No description available';

    // Set avatar
    if (profile.imageUrl) {
        avatarEl.innerHTML = `<img src="${escapeHtml(profile.imageUrl)}" alt="${escapeHtml(profile.name)}" onerror="this.parentElement.innerHTML='👤'">`;
    } else {
        avatarEl.innerHTML = isCorp ? '<span>👤</span>' : '<span>🏢</span>';
    }

    // Build contact info
    const contactRows = [];

    if (profile.email) {
        const statusColor = profile.emailStatus === 'valid' ? 'var(--status-valid)'
            : profile.emailStatus === 'risky' ? 'var(--status-risky)'
                : 'var(--text-muted)';
        contactRows.push(`
            <div class="data-row">
                <span class="data-label">Email</span>
                <span class="data-value">${escapeHtml(profile.email)} 
                    <span style="color: ${statusColor}; margin-left: 0.5rem;">(${profile.emailStatus || 'unknown'})</span>
                </span>
            </div>
        `);
    }

    if (profile.phone) {
        contactRows.push(`
            <div class="data-row">
                <span class="data-label">Phone</span>
                <span class="data-value">${escapeHtml(profile.phone)}</span>
            </div>
        `);
    }

    if (profile.address) {
        contactRows.push(`
            <div class="data-row">
                <span class="data-label">Address</span>
                <span class="data-value">${escapeHtml(profile.address)}</span>
            </div>
        `);
    }

    if (profile.website) {
        contactRows.push(`
            <div class="data-row">
                <span class="data-label">Website</span>
                <span class="data-value">
                    <a href="${escapeHtml(profile.website)}" target="_blank" rel="noopener">${escapeHtml(profile.website)}</a>
                </span>
            </div>
        `);
    }

    if (profile.linkedinUrl) {
        contactRows.push(`
            <div class="data-row">
                <span class="data-label">LinkedIn</span>
                <span class="data-value">
                    <a href="${escapeHtml(profile.linkedinUrl)}" target="_blank" rel="noopener">View Profile</a>
                </span>
            </div>
        `);
    }

    contactEl.innerHTML = contactRows.length > 0
        ? contactRows.join('')
        : '<div class="data-row"><span class="data-label">No contact information available</span></div>';

    // Build details section
    const detailRows = [];

    if (profile.workHistory) {
        detailRows.push(`
            <div class="data-row">
                <span class="data-label">Work History</span>
                <span class="data-value">${escapeHtml(profile.workHistory)}</span>
            </div>
        `);
    }

    if (profile.education) {
        detailRows.push(`
            <div class="data-row">
                <span class="data-label">Education</span>
                <span class="data-value">${escapeHtml(profile.education)}</span>
            </div>
        `);
    }

    if (profile.verificationDetails) {
        detailRows.push(`
            <div class="data-row">
                <span class="data-label">Verification</span>
                <span class="data-value">${escapeHtml(profile.verificationDetails)}</span>
            </div>
        `);
    }

    // Show/hide details section
    if (detailRows.length > 0) {
        detailsSection.classList.remove('hidden');
        detailsEl.innerHTML = detailRows.join('');
    } else {
        detailsSection.classList.add('hidden');
    }

    // Raw data
    const rawData = profile.raw_data || profile;
    rawDataEl.textContent = JSON.stringify(rawData, null, 2);

    // Show modal
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('profile-modal');
    modal.classList.remove('visible');
    document.body.style.overflow = '';
}

// Close modal on outside click
window.addEventListener('click', (event) => {
    const modal = document.getElementById('profile-modal');
    if (event.target === modal) {
        closeModal();
    }
});

// Close modal on Escape key
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeModal();
    }
});

// ============================================
// Notification System
// ============================================

function showNotification(message, type = 'info') {
    // Simple alert for now - could be enhanced with toast notifications
    alert(message);
}

// ============================================
// Recent Profiles (Global Feed)
// ============================================

async function loadRecentProfiles() {
    const container = document.getElementById('results-container');
    const header = document.getElementById('results-header');

    // Show skeleton loading
    container.innerHTML = renderSkeletonCards(3);

    try {
        const response = await fetch('/api/recent');
        if (!response.ok) {
            throw new Error('Failed to load recent');
        }

        const results = await response.json();

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3 class="empty-title">Start Discovering</h3>
                    <p class="empty-text">Enter a search above to find professionals or businesses in real-time</p>
                </div>
            `;
            return;
        }

        header.classList.remove('hidden');
        document.getElementById('results-count').textContent = `${results.length} recent`;
        document.querySelector('.results-title').textContent = 'Recent Discoveries';

        renderResults(results, container, true);

    } catch (err) {
        console.error('Failed to load recent:', err);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3 class="empty-title">Start Discovering</h3>
                <p class="empty-text">Enter a search above to find professionals or businesses in real-time</p>
            </div>
        `;
    }
}

function renderSkeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text-sm"></div>
                </div>
            </div>
        `;
    }
    return html;
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
    // Focus search on '/' key
    if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        const activeTab = document.querySelector('.tab-btn.active').id;
        const input = activeTab === 'tab-corp'
            ? document.getElementById('role-input')
            : document.getElementById('business-input');
        input.focus();
    }

    // Submit search on Enter in inputs
    if (e.key === 'Enter' && e.target.matches('input')) {
        performSearch();
    }
});

// ============================================
// Initialize
// ============================================

window.addEventListener('load', () => {
    loadRecentProfiles();
});

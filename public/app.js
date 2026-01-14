function switchTab(tab) {
    const corpSearch = document.getElementById('corp-search');
    const smbSearch = document.getElementById('smb-search');
    const tabs = document.querySelectorAll('.tab-btn');

    if (tab === 'corp') {
        corpSearch.style.display = 'block';
        smbSearch.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        corpSearch.style.display = 'none';
        smbSearch.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

async function performSearch() {
    const activeTab = document.querySelector('.tab-btn.active').innerText;
    const isCorp = activeTab.includes('Professionals');

    let payload = {};

    if (isCorp) {
        const role = document.getElementById('role-input').value;
        const company = document.getElementById('company-input').value;
        if (!role || !company) {
            alert('Please enter both Role and Company');
            return;
        }
        payload = { type: 'corp', role, company };
    } else {
        const businessType = document.getElementById('business-input').value;
        const location = document.getElementById('location-input').value;
        if (!businessType || !location) {
            alert('Please enter both Business Type and Location');
            return;
        }
        payload = { type: 'smb', businessType, location };
    }

    const container = document.getElementById('results-container');

    // Show loading state
    container.innerHTML = '<div style="text-align:center; color: #94a3b8;">Scanning Live Sources...</div>';

    // Real API Call
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Search failed');

        const results = await response.json();
        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = '<div style="text-align:center; color: #94a3b8;">No results found.</div>';
            return;
        }

        renderProfiles(results, container);

    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center; color: #ef4444;">Error fetching results.</div>';
    }
}

async function loadRecentProfiles() {
    const container = document.getElementById('results-container');
    container.innerHTML = '<div style="text-align:center; color: #94a3b8;">Loading Global Feed...</div>';

    try {
        const response = await fetch('/api/recent');
        if (!response.ok) throw new Error('Failed to load recent');
        const results = await response.json();

        container.innerHTML = '<h3 style="width:100%; text-align:center; color: #94a3b8; margin-bottom: 20px; font-weight: 400;">Global Live Feed</h3>';

        if (results.length === 0) {
            container.innerHTML += '<div style="text-align:center; color: #94a3b8;">No recent discoveries yet. Start searching!</div>';
            return;
        }

        renderProfiles(results, container);

    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center; color: #ef4444;">Failed to load feed.</div>';
    }
}

function renderProfiles(profiles, container) {
    profiles.forEach((profile) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        // Make card clickable
        card.style.cursor = 'pointer';
        card.onclick = () => openModal(profile);

        const email = profile.email || 'Not Found';
        const statusClass = profile.emailStatus === 'valid' ? 'status-valid' :
            profile.emailStatus === 'risky' ? 'status-risky' : 'status-unknown';

        const verificationText = profile.verificationDetails || 'Unverified';

        // Icons
        const hasPhone = profile.phone ? '<span title="Phone Available">📞</span>' : '';
        const hasLinkedIn = profile.linkedinUrl ? '<span title="LinkedIn Profile">🔗</span>' : '';
        const hasImage = profile.imageUrl ? '<span title="Photo Available">🖼️</span>' : '';

        // Truncate headline for card view
        const truncatedHeadline = profile.headline && profile.headline.length > 100
            ? profile.headline.substring(0, 100) + '...'
            : profile.headline;

        card.innerHTML = `
            <div class="profile-info">
                <h3>${profile.name} ${hasImage}</h3>
                <p>${truncatedHeadline}</p>
                <div class="email-row">
                    <span class="email-display revealed">${email}</span>
                    <span class="status-badge ${statusClass}">${profile.emailStatus || 'unknown'}</span>
                </div>
                <div class="meta-info">
                    ${verificationText} 
                    <span style="margin-left: 10px;">${hasPhone} ${hasLinkedIn}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Initialize
window.addEventListener('load', loadRecentProfiles);

// Helper for HTML escaping
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Toggle description in modal
function toggleDescription(element, fullText, shortText) {
    const descTextSpan = document.getElementById('desc-text');
    if (element.innerText === 'Show more') {
        descTextSpan.innerText = fullText;
        element.innerText = 'Show less';
    } else {
        descTextSpan.innerText = shortText;
        element.innerText = 'Show more';
    }
}

// Modal Logic
// Modal Logic
function openModal(profile) {
    console.log('Opening Modal for:', profile); // Debug
    const modal = document.getElementById('profile-modal');
    document.getElementById('modal-name').innerText = profile.name;
    document.getElementById('modal-headline').innerText = ''; // Clear duplicate headline/bio

    // Profile Image
    const imgContainer = document.getElementById('modal-image-container');
    if (imgContainer) {
        if (profile.imageUrl) {
            imgContainer.innerHTML = `<img src="${profile.imageUrl}" alt="${profile.name}" style="width: 80px; height: 80px; border-radius: 50%; border: 2px solid #3b82f6; object-fit: cover;">`;
            imgContainer.style.display = 'block';
        } else {
            imgContainer.style.display = 'none';
        }
    }

    // Description with Show More
    const fullDesc = profile.headline || 'N/A';
    const shortDesc = fullDesc.length > 150 ? fullDesc.substring(0, 150) + '...' : fullDesc;
    const hasMore = fullDesc.length > 150;

    const descHtml = `
            <span id="desc-text">${shortDesc}</span>
            ${hasMore ? `<a id="desc-toggle" data-full="${escapeHtml(fullDesc)}" data-short="${escapeHtml(shortDesc)}" onclick="toggleDescription(this)" style="color: #3b82f6; cursor: pointer; font-size: 0.9em; margin-left: 5px;">Show more</a>` : ''}
        `;

    // Format Contact Info
    const contactHtml = `
            <div class="data-row">
                <span class="data-label">Bio</span>
                <span class="data-value" style="max-width: 60%; text-align: right; line-height: 1.4;">${descHtml}</span>
            </div>
            ${profile.workHistory ? `
            <div class="data-row">
                <span class="data-label">Work History</span>
                <span class="data-value" style="max-width: 60%; text-align: right;">${profile.workHistory}</span>
            </div>` : ''}
            ${profile.education ? `
            <div class="data-row">
                <span class="data-label">Education</span>
                <span class="data-value" style="max-width: 60%; text-align: right;">${profile.education}</span>
            </div>` : ''}
            <div class="data-row">
                <span class="data-label">Email</span>
                <span class="data-value">${profile.email || 'N/A'}</span>
            </div>
            <div class="data-row">
                <span class="data-label">Status</span>
                <span class="data-value" style="color: ${profile.emailStatus === 'valid' ? '#4ade80' : '#fbbf24'}">${profile.emailStatus || 'Unknown'}</span>
            </div>
            <div class="data-row">
                <span class="data-label">Phone</span>
                <span class="data-value">${profile.phone || 'N/A'}</span>
            </div>
            <div class="data-row">
                <span class="data-label">Location/Address</span>
                <span class="data-value">${profile.address || 'N/A'}</span>
            </div>
            <div class="data-row">
                <span class="data-label">Website</span>
                <span class="data-value"><a href="${profile.website || '#'}" target="_blank" style="color: #60a5fa">${profile.website || 'N/A'}</a></span>
            </div>
            <div class="data-row">
                <span class="data-label">LinkedIn URL</span>
                <span class="data-value"><a href="${profile.linkedinUrl || '#'}" target="_blank" style="color: #60a5fa; word-break: break-all;">${profile.linkedinUrl || 'N/A'}</a></span>
            </div>
        `;
    document.getElementById('modal-contact-info').innerHTML = contactHtml;

    // Raw Data
    const rawData = profile.raw_data || profile;
    document.getElementById('modal-raw-data').innerText = JSON.stringify(rawData, null, 2);

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

// Close on outside click
window.onclick = function (event) {
    const modal = document.getElementById('profile-modal');
    if (event.target == modal) {
        closeModal();
    }
}

function toggleDescription(btn) {
    const span = document.getElementById('desc-text');
    const full = btn.getAttribute('data-full');
    const short = btn.getAttribute('data-short');

    if (btn.innerText === 'Show more') {
        span.innerText = full;
        btn.innerText = 'Show less';
    } else {
        span.innerText = short;
        btn.innerText = 'Show more';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

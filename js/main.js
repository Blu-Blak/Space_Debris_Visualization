// ============================================================
//  MAIN.JS — Global State, Data Loading, Navigation
// ============================================================

// --- Global State ---
const State = {
    satellites: [],          // Processed satellite objects
    currentViz: 'globe',
    satCount: 5000,          // Number to display on globe
    timeWarp: 100,           // Time multiplier
    projection3D: true,      // true = 3D globe, false = 2D map
    altRange: 'leo',         // 'leo' or 'full'
    timelineMode: 'yearly',  // 'yearly' or 'cumulative'
    showLEO: true,
    showMEO: true,
    showGEO: true,
    searchTarget: null,      // Satellite name to track
    simTime: new Date(),     // Simulated time (affected by warp)
    lastFrameTime: Date.now()
};

// --- Orbital regime classification ---
function getRegime(altKm) {
    if (altKm < 2000) return 'leo';
    if (altKm < 35786) return 'meo';
    return 'geo';
}

function getRegimeColor(regime) {
    if (regime === 'leo') return '#00ff88';
    if (regime === 'meo') return '#f5a623';
    return '#ff4d4d';
}

// --- Insight text per view ---
const insightText = {
    globe: `<strong>Live Tracker</strong> — Real-time orbital positions of tracked debris. Drag to rotate (3D) or pan (2D). Hover objects for details. Use controls to filter by regime, search objects, or adjust time speed.`,
    altitude: `<strong>Altitude Distribution</strong> — Density of tracked objects by orbital altitude. Toggle between LEO focus (0–2,000 km) and full range. Reference lines mark ISS (~408 km) and Sun-Synchronous Orbit (~800 km).`,
    heatmap: `<strong>Orbital Regime Map</strong> — 2D density map showing congestion at the intersection of altitude and inclination. Bright cells indicate "bad neighborhoods" where satellite operators should avoid deploying. This view directly answers: which orbital regimes are most congested?`,
    timeline: `<strong>Debris Timeline</strong> — Objects in the current catalog grouped by launch year. Toggle cumulative view to see total growth. Annotated lines mark major fragmentation events: Chinese ASAT (2007), Iridium-Cosmos collision (2009), Russian ASAT (2021).`
};

// ============================================================
//  DATA LOADING
// ============================================================
d3.csv("data/space_debris.csv").then(data => {
    processData(data);
    document.getElementById('loader').style.display = 'none';

    // Initialize first view
    initGlobe();
    startClock();

    // Attach all event listeners
    attachNavListeners();
    attachControlListeners();
    window.addEventListener('resize', handleResize);

}).catch(err => {
    console.error("Data load error:", err);
    document.getElementById('loader').innerHTML =
        `<p style="color:#e74c3c;">Error loading data.<br>${err.message}</p>`;
});

// ============================================================
//  DATA PROCESSING
// ============================================================
function processData(data) {
    const now = new Date();

    data.forEach(row => {
        const l1 = row.TLE_LINE1;
        const l2 = row.TLE_LINE2;
        if (!l1 || !l2) return;

        try {
            const satRec = satellite.twoline2satrec(l1.trim(), l2.trim());
            const posVel = satellite.propagate(satRec, now);

            let alt = 0;
            if (posVel.position) {
                const r = Math.sqrt(
                    posVel.position.x ** 2 +
                    posVel.position.y ** 2 +
                    posVel.position.z ** 2
                );
                alt = r - 6371; // Earth radius
            }

            // Extract inclination (degrees) — directly from CSV
            const inclination = parseFloat(row.INCLINATION) || 0;

            // Launch year
            let year = null;
            const dStr = row.LAUNCH_DATE || row.EPOCH;
            if (dStr) {
                const d = new Date(dStr);
                if (!isNaN(d)) year = d.getFullYear();
            }

            // Country code
            const country = row.COUNTRY_CODE || 'UNK';

            // Object type
            const objType = row.OBJECT_TYPE || 'UNKNOWN';

            // RCS size
            const rcsSize = row.RCS_SIZE || 'UNKNOWN';

            State.satellites.push({
                rec: satRec,
                name: (row.OBJECT_NAME || 'UNKNOWN').trim(),
                alt: alt,
                inclination: inclination,
                year: year,
                country: country,
                type: objType,
                rcs: rcsSize,
                regime: getRegime(alt)
            });
        } catch (e) {
            // Skip invalid TLEs silently
        }
    });

    console.log(`Processed ${State.satellites.length} satellites`);
}

// ============================================================
//  NAVIGATION
// ============================================================
function attachNavListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const viz = btn.dataset.viz;
            switchViz(viz);
        });
    });
}

function switchViz(id) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-viz="${id}"]`).classList.add('active');

    // Update panels
    document.querySelectorAll('.viz-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    // Update insight bar
    document.getElementById('insight-text').innerHTML = insightText[id];

    State.currentViz = id;

    // Initialize viz if needed
    if (id === 'globe') initGlobe();
    if (id === 'altitude') renderAltitude();
    if (id === 'heatmap') renderHeatmap();
    if (id === 'timeline') renderTimeline();
}

// ============================================================
//  CONTROL LISTENERS
// ============================================================
function attachControlListeners() {
    // Satellite count slider
    const slider = document.getElementById('sat-count-slider');
    const sliderLabel = document.getElementById('sat-count-label');
    slider.addEventListener('input', () => {
        State.satCount = parseInt(slider.value);
        sliderLabel.textContent = State.satCount;
    });

    // Time warp
    document.getElementById('time-warp').addEventListener('change', (e) => {
        State.timeWarp = parseInt(e.target.value);
    });

    // Projection toggle (3D / 2D)
    document.querySelectorAll('.proj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.proj-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.projection3D = btn.dataset.proj === '3d';
            toggleProjection();
        });
    });

    // Regime filters
    document.getElementById('filter-leo').addEventListener('change', (e) => {
        State.showLEO = e.target.checked;
    });
    document.getElementById('filter-meo').addEventListener('change', (e) => {
        State.showMEO = e.target.checked;
    });
    document.getElementById('filter-geo').addEventListener('change', (e) => {
        State.showGEO = e.target.checked;
    });

    // Altitude range toggle
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.altRange = btn.dataset.range;
            renderAltitude();
        });
    });

    // Timeline mode toggle
    document.querySelectorAll('.tl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tl-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.timelineMode = btn.dataset.mode;
            renderTimeline();
        });
    });

    // Search
    const searchInput = document.getElementById('sat-search');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toUpperCase().trim();
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const matches = State.satellites
            .filter(s => s.name.includes(query))
            .slice(0, 10);

        if (matches.length === 0) {
            searchResults.style.display = 'none';
            return;
        }

        searchResults.innerHTML = matches
            .map(s => `<div class="search-item" data-name="${s.name}">${s.name}</div>`)
            .join('');
        searchResults.style.display = 'block';

        searchResults.querySelectorAll('.search-item').forEach(item => {
            item.addEventListener('click', () => {
                State.searchTarget = item.dataset.name;
                searchInput.value = item.dataset.name;
                searchResults.style.display = 'none';
            });
        });
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => { searchResults.style.display = 'none'; }, 200);
    });
}

// ============================================================
//  CLOCK
// ============================================================
function startClock() {
    State.simTime = new Date();
    State.lastFrameTime = Date.now();

    setInterval(() => {
        // Real clock
        const now = new Date();
        document.getElementById('clock').textContent = now.toUTCString().split(' ')[4];
    }, 1000);
}

// Called every animation frame from globe.js
function updateSimTime() {
    const now = Date.now();
    const delta = now - State.lastFrameTime;
    State.lastFrameTime = now;

    // Advance simulated time by delta * warp factor
    State.simTime = new Date(State.simTime.getTime() + delta * State.timeWarp);

    const st = State.simTime;
    document.getElementById('sim-clock').textContent =
        st.toUTCString().split(' ').slice(1, 5).join(' ');
}

// ============================================================
//  RESIZE HANDLER
// ============================================================
function handleResize() {
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(() => {
        if (State.currentViz === 'globe') initGlobe();
        if (State.currentViz === 'altitude') renderAltitude();
        if (State.currentViz === 'heatmap') renderHeatmap();
        if (State.currentViz === 'timeline') renderTimeline();
    }, 150);
}

// ============================================================
//  TOOLTIP HELPER
// ============================================================
function showTooltip(html, x, y) {
    const tt = document.getElementById('tooltip');
    tt.innerHTML = html;
    tt.style.display = 'block';

    // Position with boundary check
    const rect = tt.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 15;
    let top = y + 15;

    if (left + rect.width > vw - 10) left = x - rect.width - 15;
    if (top + rect.height > vh - 10) top = y - rect.height - 15;

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
}
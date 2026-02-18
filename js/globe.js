// ============================================================
//  GLOBE.JS — 3D Globe + 2D Map Toggle (Viz 1: Live Tracker)
// ============================================================

let globeCanvas, globeCtx, globeProjection, globePath;
let mapSvg, mapProjection, mapPath;
let worldLand = null;
let animFrameId = null;
let globeMousePos = null;
let globeDragRotation = [0, -20]; // [lambda, phi]

// ============================================================
//  INITIALIZATION
// ============================================================
function initGlobe() {
    const container = document.getElementById('globe');
    globeCanvas = document.getElementById('globe-canvas');

    const width = container.clientWidth;
    const height = container.clientHeight;

    globeCanvas.width = width;
    globeCanvas.height = height;
    globeCtx = globeCanvas.getContext('2d');

    const radius = Math.min(width, height) / 2.3;

    globeProjection = d3.geoOrthographic()
        .scale(radius)
        .translate([width / 2, height / 2])
        .rotate(globeDragRotation)
        .clipAngle(90);

    globePath = d3.geoPath().projection(globeProjection).context(globeCtx);

    // Drag to rotate
    d3.select(globeCanvas).call(
        d3.drag()
            .on('drag', (event) => {
                const k = 75 / globeProjection.scale();
                globeDragRotation[0] += event.dx * k;
                globeDragRotation[1] -= event.dy * k;
                globeDragRotation[1] = Math.max(-90, Math.min(90, globeDragRotation[1]));
                globeProjection.rotate(globeDragRotation);
            })
    );

    // Mouse tracking for tooltip
    d3.select(globeCanvas).on('mousemove', (event) => {
        const rect = globeCanvas.getBoundingClientRect();
        globeMousePos = [event.clientX - rect.left, event.clientY - rect.top];
    });
    d3.select(globeCanvas).on('mouseleave', () => {
        globeMousePos = null;
        hideTooltip();
    });

    // Load world data once, then start animation
    if (!worldLand) {
        d3.json("https://unpkg.com/world-atlas@2.0.2/countries-110m.json").then(world => {
            worldLand = topojson.feature(world, world.objects.countries);
            startGlobeAnimation();
        });
    } else if (!animFrameId) {
        startGlobeAnimation();
    }
}

// ============================================================
//  2D MAP INITIALIZATION
// ============================================================
function init2DMap() {
    const container = document.getElementById('map-container');
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;

    mapProjection = d3.geoEquirectangular()
        .scale(width / (2 * Math.PI))
        .translate([width / 2, height / 2]);

    mapPath = d3.geoPath().projection(mapProjection);

    mapSvg = d3.select('#map-container').append('svg')
        .attr('width', width)
        .attr('height', height);

    // Background
    mapSvg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', '#0b1026');

    // Draw land
    if (worldLand) {
        mapSvg.append('g')
            .selectAll('path')
            .data(worldLand.features)
            .enter().append('path')
            .attr('d', mapPath)
            .attr('fill', '#1c3018')
            .attr('stroke', '#2a4020')
            .attr('stroke-width', 0.5);
    }

    // Graticule
    const graticule = d3.geoGraticule();
    mapSvg.append('path')
        .datum(graticule)
        .attr('d', mapPath)
        .attr('fill', 'none')
        .attr('stroke', '#1a2340')
        .attr('stroke-width', 0.3);

    // Satellite dot layer
    mapSvg.append('g').attr('id', 'map-dots');

    // Start 2D update loop
    start2DMapLoop();
}

let map2DInterval = null;

function start2DMapLoop() {
    if (map2DInterval) clearInterval(map2DInterval);

    map2DInterval = setInterval(() => {
        if (State.currentViz !== 'globe' || State.projection3D) {
            clearInterval(map2DInterval);
            map2DInterval = null;
            return;
        }
        update2DMap();
    }, 500); // Update every 500ms (2D doesn't need 60fps)

    update2DMap(); // Immediate first render
}

function update2DMap() {
    updateSimTime();

    const simTime = State.simTime;
    const gmst = satellite.gstime(simTime);
    const dotGroup = d3.select('#map-dots');

    // Subsample
    const subset = getVisibleSubset();
    const positions = [];

    subset.forEach(sat => {
        try {
            const pv = satellite.propagate(sat.rec, simTime);
            if (!pv.position) return;

            const gd = satellite.eciToGeodetic(pv.position, gmst);
            const lon = satellite.degreesLong(gd.longitude);
            const lat = satellite.degreesLat(gd.latitude);
            const xy = mapProjection([lon, lat]);

            if (xy) {
                positions.push({
                    x: xy[0], y: xy[1],
                    name: sat.name,
                    alt: sat.alt,
                    regime: sat.regime,
                    lat, lon,
                    isTarget: sat.name === State.searchTarget
                });
            }
        } catch (e) { /* skip */ }
    });

    // Data join
    const dots = dotGroup.selectAll('circle').data(positions, (d, i) => i);

    dots.enter().append('circle')
        .attr('r', d => d.isTarget ? 5 : 1.8)
        .merge(dots)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('fill', d => getRegimeColor(d.regime))
        .attr('r', d => d.isTarget ? 5 : 1.8)
        .attr('stroke', d => d.isTarget ? '#fff' : 'none')
        .attr('stroke-width', d => d.isTarget ? 2 : 0)
        .attr('opacity', 0.8);

    dots.exit().remove();

    // Tooltip via SVG events
    dotGroup.selectAll('circle')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('r', 5).attr('stroke', '#fff').attr('stroke-width', 1.5);
            showTooltip(
                `<strong>${d.name}</strong>\nAlt: ${Math.round(d.alt)} km\nLat: ${d.lat.toFixed(2)}°\nLon: ${d.lon.toFixed(2)}°\nRegime: ${d.regime.toUpperCase()}`,
                event.pageX, event.pageY
            );
        })
        .on('mouseout', function (event, d) {
            d3.select(this).attr('r', d.isTarget ? 5 : 1.8).attr('stroke', d.isTarget ? '#fff' : 'none');
            hideTooltip();
        });
}

// ============================================================
//  PROJECTION TOGGLE
// ============================================================
function toggleProjection() {
    if (State.projection3D) {
        // Switch to 3D
        document.getElementById('globe-canvas').style.display = 'block';
        document.getElementById('map-container').style.display = 'none';
        if (map2DInterval) { clearInterval(map2DInterval); map2DInterval = null; }
        initGlobe();
    } else {
        // Switch to 2D
        document.getElementById('globe-canvas').style.display = 'none';
        document.getElementById('map-container').style.display = 'block';
        init2DMap();
    }
}

// ============================================================
//  HELPER: Get filtered + subsampled satellites
// ============================================================
function getVisibleSubset() {
    let filtered = State.satellites.filter(sat => {
        if (sat.regime === 'leo' && !State.showLEO) return false;
        if (sat.regime === 'meo' && !State.showMEO) return false;
        if (sat.regime === 'geo' && !State.showGEO) return false;
        return true;
    });

    // Always include search target
    const target = State.searchTarget
        ? State.satellites.find(s => s.name === State.searchTarget)
        : null;

    // Subsample
    if (filtered.length > State.satCount) {
        const step = filtered.length / State.satCount;
        const sampled = [];
        for (let i = 0; i < filtered.length; i += step) {
            sampled.push(filtered[Math.floor(i)]);
        }
        filtered = sampled;
    }

    // Ensure target is included
    if (target && !filtered.includes(target)) {
        filtered.push(target);
    }

    return filtered;
}

// ============================================================
//  3D GLOBE ANIMATION LOOP
// ============================================================
function startGlobeAnimation() {
    const sphere = { type: "Sphere" };

    function frame() {
        animFrameId = requestAnimationFrame(frame);

        // Skip if not visible or in 2D mode
        if (State.currentViz !== 'globe' || !State.projection3D) return;

        updateSimTime();

        const width = globeCanvas.width;
        const height = globeCanvas.height;
        const simTime = State.simTime;
        const gmst = satellite.gstime(simTime);

        // Clear
        globeCtx.clearRect(0, 0, width, height);

        // Draw sphere background
        globeCtx.beginPath();
        globePath(sphere);
        globeCtx.fillStyle = '#0b1026';
        globeCtx.fill();

        // Draw graticule
        const graticule = d3.geoGraticule10();
        globeCtx.beginPath();
        globePath(graticule);
        globeCtx.strokeStyle = '#1a2340';
        globeCtx.lineWidth = 0.3;
        globeCtx.stroke();

        // Draw land
        if (worldLand) {
            globeCtx.beginPath();
            globePath(worldLand);
            globeCtx.fillStyle = '#1c3018';
            globeCtx.fill();
            globeCtx.strokeStyle = '#2a4020';
            globeCtx.lineWidth = 0.5;
            globeCtx.stroke();
        }

        // Get center for visibility check
        const center = globeProjection.invert([width / 2, height / 2]);
        const subset = getVisibleSubset();

        let hoveredSat = null;
        let minDist = 12;
        let targetSatXY = null;

        // Draw satellites
        subset.forEach(sat => {
            try {
                const pv = satellite.propagate(sat.rec, simTime);
                if (!pv.position) return;

                const gd = satellite.eciToGeodetic(pv.position, gmst);
                const lon = satellite.degreesLong(gd.longitude);
                const lat = satellite.degreesLat(gd.latitude);

                // Hemisphere check
                if (d3.geoDistance(center, [lon, lat]) > Math.PI / 2) return;

                const xy = globeProjection([lon, lat]);
                if (!xy) return;

                const isTarget = sat.name === State.searchTarget;
                const color = getRegimeColor(sat.regime);
                const radius = isTarget ? 4 : 1.5;

                globeCtx.beginPath();
                globeCtx.arc(xy[0], xy[1], radius, 0, 2 * Math.PI);
                globeCtx.fillStyle = color;
                globeCtx.fill();

                if (isTarget) {
                    targetSatXY = xy;
                    // Draw ring around target
                    globeCtx.beginPath();
                    globeCtx.arc(xy[0], xy[1], 8, 0, 2 * Math.PI);
                    globeCtx.strokeStyle = '#fff';
                    globeCtx.lineWidth = 2;
                    globeCtx.stroke();

                    // Label
                    globeCtx.fillStyle = '#fff';
                    globeCtx.font = '11px Segoe UI';
                    globeCtx.fillText(sat.name, xy[0] + 12, xy[1] + 4);
                }

                // Hover detection
                if (globeMousePos) {
                    const dx = globeMousePos[0] - xy[0];
                    const dy = globeMousePos[1] - xy[1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < minDist) {
                        minDist = dist;
                        hoveredSat = { ...sat, lat, lon, xy };
                    }
                }
            } catch (e) { /* skip */ }
        });

        // Tooltip for hovered satellite
        if (hoveredSat) {
            // Highlight ring
            globeCtx.beginPath();
            globeCtx.arc(hoveredSat.xy[0], hoveredSat.xy[1], 6, 0, 2 * Math.PI);
            globeCtx.strokeStyle = '#4facfe';
            globeCtx.lineWidth = 2;
            globeCtx.stroke();

            showTooltip(
                `<strong>${hoveredSat.name}</strong>\n` +
                `Alt: ${Math.round(hoveredSat.alt)} km\n` +
                `Lat: ${hoveredSat.lat.toFixed(2)}°\n` +
                `Lon: ${hoveredSat.lon.toFixed(2)}°\n` +
                `Regime: ${hoveredSat.regime.toUpperCase()}\n` +
                `Type: ${hoveredSat.type}\n` +
                `Country: ${hoveredSat.country}`,
                globeMousePos[0] + document.getElementById('globe').getBoundingClientRect().left,
                globeMousePos[1] + document.getElementById('globe').getBoundingClientRect().top
            );
        } else if (globeMousePos) {
            hideTooltip();
        }

        // Object count display
        globeCtx.fillStyle = '#556';
        globeCtx.font = '11px Segoe UI';
        globeCtx.fillText(`Displaying: ${subset.length} / ${State.satellites.length} objects`, 10, height - 10);
    }

    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(frame);
}
// ============================================================
//  HEATMAP.JS — Altitude × Inclination Density Map (Viz 3)
// ============================================================

function renderHeatmap() {
    const container = document.getElementById('heatmap-chart');
    container.innerHTML = '';

    const W = container.clientWidth;
    const H = container.clientHeight;
    const margin = { top: H * 0.1, right: W * 0.12, bottom: H * 0.14, left: W * 0.09 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const svg = d3.select('#heatmap-chart').append('svg')
        .attr('width', W)
        .attr('height', H)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- Data: bin by altitude × inclination ---
    const altMax = 2000;   // Focus on LEO for density
    const altBins = 40;
    const incBins = 36;    // 0–180 degrees, 5° steps
    const altStep = altMax / altBins;
    const incStep = 180 / incBins;

    // Build 2D bin grid
    const grid = [];
    const countMatrix = Array.from({ length: altBins }, () => Array(incBins).fill(0));

    State.satellites.forEach(sat => {
        if (sat.alt < 0 || sat.alt > altMax) return;
        if (sat.inclination < 0 || sat.inclination > 180) return;

        const ai = Math.min(Math.floor(sat.alt / altStep), altBins - 1);
        const ii = Math.min(Math.floor(sat.inclination / incStep), incBins - 1);
        countMatrix[ai][ii]++;
    });

    let maxCount = 0;
    for (let ai = 0; ai < altBins; ai++) {
        for (let ii = 0; ii < incBins; ii++) {
            const count = countMatrix[ai][ii];
            if (count > maxCount) maxCount = count;
            grid.push({
                altBin: ai,
                incBin: ii,
                altLow: ai * altStep,
                altHigh: (ai + 1) * altStep,
                incLow: ii * incStep,
                incHigh: (ii + 1) * incStep,
                count: count
            });
        }
    }

    // --- Scales ---
    const x = d3.scaleLinear().domain([0, 180]).range([0, width]);
    const y = d3.scaleLinear().domain([0, altMax]).range([height, 0]);

    // Color scale: dark blue → orange → bright yellow
    const color = d3.scaleSequential()
        .domain([0, maxCount])
        .interpolator(d3.interpolateInferno);

    // --- Title ---
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2 + 5)
        .text('Orbital Regime Congestion — Altitude vs. Inclination (LEO)');

    // --- Heatmap cells ---
    const cellW = width / incBins;
    const cellH = height / altBins;

    svg.selectAll('.heatmap-cell')
        .data(grid)
        .enter().append('rect')
        .attr('class', 'heatmap-cell')
        .attr('x', d => x(d.incLow))
        .attr('y', d => y(d.altHigh))
        .attr('width', cellW)
        .attr('height', cellH)
        .attr('fill', d => d.count === 0 ? '#0a0f1c' : color(d.count))
        .on('mouseover', function (event, d) {
            d3.select(this).attr('stroke', '#fff').attr('stroke-width', 2);
            showTooltip(
                `<strong>Regime Cell</strong>\n` +
                `Altitude: ${Math.round(d.altLow)}–${Math.round(d.altHigh)} km\n` +
                `Inclination: ${d.incLow.toFixed(0)}°–${d.incHigh.toFixed(0)}°\n\n` +
                `<strong>Objects: ${d.count}</strong>`,
                event.pageX, event.pageY
            );
        })
        .on('mousemove', (event) => {
            const tt = document.getElementById('tooltip');
            tt.style.left = (event.pageX + 15) + 'px';
            tt.style.top = (event.pageY - 10) + 'px';
        })
        .on('mouseout', function () {
            d3.select(this).attr('stroke', '#0a0f1c').attr('stroke-width', 0.5);
            hideTooltip();
        });

    // --- Axes ---
    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(12).tickFormat(d => d + '°'));

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(10));

    // --- Axis Labels ---
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom * 0.65)
        .text('Inclination (degrees)');

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 20)
        .attr('x', -height / 2)
        .text('Altitude (km)');

    // --- Color Legend ---
    const legendWidth = 20;
    const legendHeight = height * 0.6;
    const legendX = width + 30;
    const legendY = (height - legendHeight) / 2;

    // Gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'heatmap-gradient')
        .attr('x1', '0%').attr('y1', '100%')
        .attr('x2', '0%').attr('y2', '0%');

    const nStops = 10;
    for (let i = 0; i <= nStops; i++) {
        gradient.append('stop')
            .attr('offset', `${(i / nStops) * 100}%`)
            .attr('stop-color', color((i / nStops) * maxCount));
    }

    svg.append('rect')
        .attr('x', legendX)
        .attr('y', legendY)
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#heatmap-gradient)')
        .attr('rx', 3);

    // Legend scale
    const legendScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([legendHeight, 0]);

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(${legendX + legendWidth + 4},${legendY})`)
        .call(d3.axisRight(legendScale).ticks(5).tickSize(3));

    svg.append('text')
        .attr('fill', '#667')
        .attr('font-size', '0.7rem')
        .attr('text-anchor', 'middle')
        .attr('transform', `translate(${legendX + legendWidth / 2},${legendY - 10})`)
        .text('Count');

    // --- Annotation: key orbital regimes ---
    // ISS (408 km, 51.6°)
    addHeatmapAnnotation(svg, x, y, 51.6, 408, 'ISS', '#2ecc71');
    // SSO (800 km, 98.7°)
    addHeatmapAnnotation(svg, x, y, 98.7, 800, 'SSO', '#e74c3c');
    // Starlink (550 km, 53°)
    addHeatmapAnnotation(svg, x, y, 53, 550, 'Starlink', '#f5a623');
}

function addHeatmapAnnotation(svg, x, y, inc, alt, label, color) {
    const cx = x(inc);
    const cy = y(alt);

    svg.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 4)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2);

    svg.append('text')
        .attr('x', cx + 7)
        .attr('y', cy + 4)
        .attr('fill', color)
        .attr('font-size', '0.72rem')
        .attr('font-weight', '600')
        .text(label);
}
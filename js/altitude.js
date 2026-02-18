// ============================================================
//  ALTITUDE.JS — Altitude Distribution Histogram (Viz 2)
// ============================================================

function renderAltitude() {
    const container = document.getElementById('alt-chart');
    container.innerHTML = '';

    const W = container.clientWidth;
    const H = container.clientHeight;
    const margin = { top: H * 0.08, right: W * 0.05, bottom: H * 0.14, left: W * 0.09 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const svg = d3.select('#alt-chart').append('svg')
        .attr('width', W)
        .attr('height', H)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- Data ---
    const isLEO = State.altRange === 'leo';
    const maxAlt = isLEO ? 2000 : 45000;
    const minAlt = isLEO ? 150 : 150;
    const numBins = isLEO ? 50 : 80;

    const altitudes = State.satellites
        .map(d => d.alt)
        .filter(d => d >= minAlt && d <= maxAlt);

    // --- Scales ---
    const x = d3.scaleLinear()
        .domain([minAlt, maxAlt])
        .range([0, width]);

    const bins = d3.bin()
        .domain(x.domain())
        .thresholds(x.ticks(numBins))
        (altitudes);

    const yMax = d3.max(bins, d => d.length);

    // Use log scale for full range to handle GEO spike
    const useLog = !isLEO && yMax > 100;
    const y = useLog
        ? d3.scaleSymlog().domain([0, yMax]).range([height, 0]).constant(10)
        : d3.scaleLinear().domain([0, yMax]).range([height, 0]);

    // --- Title ---
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2 + 5)
        .text(isLEO ? 'Altitude Distribution — LEO Focus (150–2,000 km)' : 'Altitude Distribution — Full Range');

    // --- Bars ---
    svg.selectAll('.bar-alt')
        .data(bins)
        .enter().append('rect')
        .attr('class', 'bar-alt')
        .attr('x', d => x(d.x0) + 1)
        .attr('y', d => y(d.length))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr('height', d => height - y(d.length))
        .on('mouseover', function (event, d) {
            d3.select(this).style('fill', '#7ec4ff');
            showTooltip(
                `<strong>Altitude Range</strong>\n${Math.round(d.x0)}–${Math.round(d.x1)} km\n\n<strong>Object Count:</strong> ${d.length}`,
                event.pageX, event.pageY
            );
        })
        .on('mousemove', (event) => {
            const tt = document.getElementById('tooltip');
            tt.style.left = (event.pageX + 15) + 'px';
            tt.style.top = (event.pageY - 10) + 'px';
        })
        .on('mouseout', function () {
            d3.select(this).style('fill', null);
            hideTooltip();
        });

    // --- Axes ---
    const xAxis = svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(isLEO ? 10 : 8).tickFormat(d => {
            if (d >= 1000) return (d / 1000) + 'k';
            return d;
        }));

    const yAxisGen = useLog
        ? d3.axisLeft(y).ticks(8).tickFormat(d3.format('.0f'))
        : d3.axisLeft(y).ticks(8);

    svg.append('g')
        .attr('class', 'axis')
        .call(yAxisGen);

    // --- Axis Labels ---
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom * 0.7)
        .text('Altitude (km)');

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 20)
        .attr('x', -height / 2)
        .text(useLog ? 'Object Count (symlog scale)' : 'Object Count');

    // --- Reference Lines ---
    if (isLEO) {
        addRefLine(svg, x, height, 408, 'ISS (~408 km)', 'ref-line', 'ref-label');
        addRefLine(svg, x, height, 800, 'SSO (~800 km)', 'ref-line-warn', 'ref-label-warn');
        addRefLine(svg, x, height, 550, 'Starlink (~550 km)', 'ref-line-event', 'ref-label-event');
    } else {
        addRefLine(svg, x, height, 408, 'ISS', 'ref-line', 'ref-label');
        addRefLine(svg, x, height, 2000, 'LEO/MEO boundary', 'ref-line-event', 'ref-label-event');
        addRefLine(svg, x, height, 20200, 'GPS (~20,200 km)', 'ref-line-event', 'ref-label-event');
        addRefLine(svg, x, height, 35786, 'GEO (~35,786 km)', 'ref-line-warn', 'ref-label-warn');
    }

    // Scale note if using log
    if (useLog) {
        svg.append('text')
            .attr('x', width - 10)
            .attr('y', 15)
            .attr('text-anchor', 'end')
            .attr('fill', '#556')
            .attr('font-size', '0.72rem')
            .text('⚠ Y-axis uses symmetric log scale for readability');
    }
}

// --- Helper: add a vertical reference line ---
function addRefLine(svg, xScale, chartHeight, value, label, lineClass, labelClass) {
    const xPos = xScale(value);
    if (xPos < 0 || xPos > xScale.range()[1]) return; // out of view

    svg.append('line')
        .attr('x1', xPos).attr('x2', xPos)
        .attr('y1', 0).attr('y2', chartHeight)
        .attr('class', lineClass);

    svg.append('text')
        .attr('x', xPos + 4)
        .attr('y', 14)
        .attr('class', labelClass)
        .text(label);
}
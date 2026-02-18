// ============================================================
//  TIMELINE.JS — Debris Timeline with Event Annotations (Viz 4)
// ============================================================

// Major fragmentation events to annotate
const SHOCK_EVENTS = [
    { year: 1999, label: 'Peak launch\nactivity', color: '#4facfe' }
];

function renderTimeline() {
    const container = document.getElementById('timeline-chart');
    container.innerHTML = '';

    const W = container.clientWidth;
    const H = container.clientHeight;
    const margin = { top: H * 0.1, right: W * 0.05, bottom: H * 0.16, left: W * 0.08 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const svg = d3.select('#timeline-chart').append('svg')
        .attr('width', W)
        .attr('height', H)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- Data ---
    const yearData = d3.rollups(
        State.satellites.filter(d => d.year && d.year >= 1957 && d.year <= 2025),
        v => v.length,
        d => d.year
    ).sort((a, b) => a[0] - b[0]);

    const isCumulative = State.timelineMode === 'cumulative';

    // Build cumulative if needed
    let plotData;
    if (isCumulative) {
        let running = 0;
        plotData = yearData.map(([year, count]) => {
            running += count;
            return { year, count: running, raw: count };
        });
    } else {
        plotData = yearData.map(([year, count]) => ({ year, count, raw: count }));
    }

    // --- Scales ---
    const x = d3.scaleBand()
        .domain(plotData.map(d => d.year))
        .range([0, width])
        .padding(0.15);

    const yMax = d3.max(plotData, d => d.count);
    const y = d3.scaleLinear()
        .domain([0, yMax * 1.05])
        .range([height, 0]);

    // --- Title ---
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2 + 5)
        .text(isCumulative
            ? 'Cumulative Debris Accumulation by Launch Year'
            : 'Currently Tracked Objects by Launch Year');

    // --- Draw bars or area ---
    if (isCumulative) {
        // Area + line for cumulative view
        const lineGen = d3.line()
            .x(d => x(d.year) + x.bandwidth() / 2)
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX);

        const areaGen = d3.area()
            .x(d => x(d.year) + x.bandwidth() / 2)
            .y0(height)
            .y1(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Area fill
        svg.append('path')
            .datum(plotData)
            .attr('d', areaGen)
            .attr('fill', 'rgba(79, 172, 254, 0.15)')
            .attr('stroke', 'none');

        // Line
        svg.append('path')
            .datum(plotData)
            .attr('d', lineGen)
            .attr('class', 'cumulative-line');

        // Dots for hover
        svg.selectAll('.cum-dot')
            .data(plotData)
            .enter().append('circle')
            .attr('cx', d => x(d.year) + x.bandwidth() / 2)
            .attr('cy', d => y(d.count))
            .attr('r', 3)
            .attr('fill', '#4facfe')
            .attr('stroke', '#0d1525')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseover', function (event, d) {
                d3.select(this).attr('r', 6).attr('stroke', '#fff');
                showTooltip(
                    `<strong>Year: ${d.year}</strong>\n` +
                    `Launched that year: ${d.raw}\n` +
                    `Cumulative total: ${d.count}`,
                    event.pageX, event.pageY
                );
            })
            .on('mousemove', (event) => {
                const tt = document.getElementById('tooltip');
                tt.style.left = (event.pageX + 15) + 'px';
                tt.style.top = (event.pageY - 10) + 'px';
            })
            .on('mouseout', function () {
                d3.select(this).attr('r', 3).attr('stroke', '#0d1525');
                hideTooltip();
            });

    } else {
        // Bar chart for yearly view
        svg.selectAll('.bar-year')
            .data(plotData)
            .enter().append('rect')
            .attr('class', 'bar-year')
            .attr('x', d => x(d.year))
            .attr('y', d => y(d.count))
            .attr('width', x.bandwidth())
            .attr('height', d => height - y(d.count))
            .on('mouseover', function (event, d) {
                d3.select(this).style('fill', '#e8705f');
                showTooltip(
                    `<strong>Year: ${d.year}</strong>\n\nObjects launched: ${d.count}`,
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
    }

    // --- Axes ---
    const tickYears = plotData
        .map(d => d.year)
        .filter(y => y % 5 === 0);

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickValues(tickYears))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');

    svg.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(8));

    // --- Axis Labels ---
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom * 0.8)
        .text('Launch Year');

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 18)
        .attr('x', -height / 2)
        .text(isCumulative ? 'Cumulative Object Count' : 'Object Count');

    // --- Shock Event Annotations ---
    SHOCK_EVENTS.forEach(evt => {
        if (!x(evt.year)) return; // year not in data

        const xPos = x(evt.year) + x.bandwidth() / 2;
        const lines = evt.label.split('\n');

        svg.append('line')
            .attr('x1', xPos).attr('x2', xPos)
            .attr('y1', 0).attr('y2', height)
            .attr('stroke', evt.color)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5,3')
            .attr('opacity', 0.8);

        // Multi-line label
        lines.forEach((line, i) => {
            svg.append('text')
                .attr('x', xPos + 5)
                .attr('y', 15 + i * 13)
                .attr('fill', evt.color)
                .attr('font-size', '0.68rem')
                .attr('font-weight', '600')
                .text(line);
        });
    });
}
/**
 * Chart module — Chart.js line/pie initialization, update, and theme switching.
 * Depends on: common.js (window.Common), Chart.js global
 * Exported as: window.ChartModule
 */
(function() {
    'use strict';

    var _hasChart = typeof Chart !== 'undefined';

    /* ---- Theme-aware helpers ---- */
    function getChartTooltipOpts() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            backgroundColor: isDark ? '#1c2128' : '#fff',
            titleColor: isDark ? '#e6edf3' : '#1a1d21',
            bodyColor: isDark ? '#8b949e' : '#656d76',
            borderColor: isDark ? '#30363d' : '#e4e6eb',
            borderWidth: 1, cornerRadius: 8, padding: 10,
            titleFont: { size: 12, weight: '700' },
            bodyFont: { size: 11 }
        };
    }

    function getChartGridColor() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)';
    }

    function getChartTickColor() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            ? '#8b949e' : '#a5acb4';
    }

    /* ---- Chart instances ---- */
    var lineChart = null;
    var pieChart = null;

    if (_hasChart) {
        var lineCtx = document.getElementById('lineChart');
        if (lineCtx) {
            lineChart = new Chart(lineCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        borderColor: '#0969da',
                        backgroundColor: 'rgba(9,105,218,.08)',
                        fill: true, tension: .4,
                        pointRadius: 2, pointHoverRadius: 5,
                        pointBackgroundColor: '#0969da', borderWidth: 2
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { intersect: false, mode: 'index' },
                    plugins: { legend: { display: false }, tooltip: getChartTooltipOpts() },
                    scales: {
                        x: { ticks: { color: getChartTickColor(), font: { size: 10 }, maxRotation: 45 }, grid: { color: getChartGridColor() } },
                        y: { min: 0, ticks: { color: getChartTickColor(), font: { size: 10 } }, grid: { color: getChartGridColor() } }
                    }
                }
            });
        }

        var pieCtx = document.getElementById('pieChart');
        if (pieCtx) {
            pieChart = new Chart(pieCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['暂无数据'],
                    datasets: [{ data: [1], backgroundColor: ['#e4e6eb'], borderWidth: 0, hoverOffset: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    plugins: {
                        legend: { position: 'right', labels: { color: getChartTickColor(), font: { size: 11 }, boxWidth: 9, padding: 10 } },
                        tooltip: getChartTooltipOpts()
                    }
                }
            });
        }
    }

    /* ---- Theme update ---- */
    function updateChartTheme() {
        if (!_hasChart) return;
        var ttp = getChartTooltipOpts();
        var gc = getChartGridColor();
        var tc = getChartTickColor();
        [lineChart, pieChart].forEach(function(c) {
            if (!c) return;
            c.options.plugins.tooltip = ttp;
            if (c.options.scales && c.options.scales.x) { c.options.scales.x.ticks.color = tc; c.options.scales.x.grid.color = gc; }
            if (c.options.scales && c.options.scales.y) { c.options.scales.y.ticks.color = tc; c.options.scales.y.grid.color = gc; }
            if (c.options.plugins && c.options.plugins.legend && c.options.plugins.legend.labels) c.options.plugins.legend.labels.color = tc;
            c.update('none');
        });
    }

    /* ---- Range buttons ---- */
    function setChartRange(range, btn) {
        document.querySelectorAll('[id^=chartBtn]').forEach(function(b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        // fetchData is called externally by the page
        if (typeof window.fetchData === 'function') window.fetchData();
    }

    /* ---- Export ---- */
    window.ChartModule = {
        lineChart: lineChart,
        pieChart: pieChart,
        updateChartTheme: updateChartTheme,
        setChartRange: setChartRange,
        getChartTooltipOpts: getChartTooltipOpts,
        getChartGridColor: getChartGridColor,
        getChartTickColor: getChartTickColor
    };
})();

/**
 * Detection module — detection table rendering, CSV export, image viewer, filters, clear.
 * Depends on: common.js (window.Common)
 * Exported as: window.DetectionModule
 */
(function() {
    'use strict';

    var Common = window.Common;
    var API_BASE = Common.API_BASE;
    var TYPES = [
        { name: '跌倒', cls: 'badge-orange' },
        { name: '打架', cls: 'badge-red' },
        { name: '疲劳', cls: 'badge-purple' },
        { name: '离岗', cls: 'badge-blue' },
        { name: '人员聚集', cls: 'badge-green' }
    ];

    /* ---- Build a single detection table row (XSS-safe) ---- */
    function buildDetRow(det) {
        var typeObj = TYPES.find(function(t) { return t.name === det.type; }) || TYPES[0];
        var status = det.type && det.type !== '---' ? '已检测' : '常规';
        var statusCls = status === '已检测' ? 'badge-blue' : 'badge-green';

        var tr = document.createElement('tr');

        var tdTime = document.createElement('td');
        tdTime.style.cssText = 'font-family:monospace;font-size:11px';
        tdTime.textContent = det.timeStr || det.timestamp || '--';
        tr.appendChild(tdTime);

        var tdType = document.createElement('td');
        var typeSpan = document.createElement('span');
        typeSpan.className = 'badge ' + typeObj.cls;
        typeSpan.textContent = det.type || '---';
        tdType.appendChild(typeSpan);
        tr.appendChild(tdType);

        var tdPeople = document.createElement('td');
        tdPeople.textContent = (det.people || 0) + '人';
        tr.appendChild(tdPeople);

        var tdFps = document.createElement('td');
        tdFps.textContent = det.fps || '--';
        tr.appendChild(tdFps);

        var tdStatus = document.createElement('td');
        var statusSpan = document.createElement('span');
        statusSpan.className = 'badge ' + statusCls;
        statusSpan.textContent = status;
        tdStatus.appendChild(statusSpan);
        tr.appendChild(tdStatus);

        var tdAction = document.createElement('td');
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = '\uD83D\uDCF7';
        btn.addEventListener('click', function() {
            viewImage(det.imageFilename || '', det.type || '', det.timeStr || '', det.fps || '--');
        });
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        return tr;
    }

    /* ---- Render detection table ---- */
    function renderDetTable(dets) {
        var tbody = document.getElementById('detTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (dets.length === 0) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.setAttribute('colspan', '6');
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            var iconDiv = document.createElement('div');
            iconDiv.className = 'empty-state-icon';
            iconDiv.textContent = '\uD83D\uDCCA';
            var textDiv = document.createElement('div');
            textDiv.className = 'empty-state-text';
            textDiv.textContent = '暂无检测记录，等待AI引擎产生数据...';
            emptyDiv.appendChild(iconDiv);
            emptyDiv.appendChild(textDiv);
            td.appendChild(emptyDiv);
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            dets.forEach(function(d) {
                tbody.appendChild(buildDetRow(d));
            });
        }
    }

    /* ---- Update detection table from API data ---- */
    function updateDetTable(data) {
        var dets = [];
        if (data && data.allDetections && data.allDetections.length > 0) {
            dets = data.allDetections.slice(0, 50).map(function(d) {
                return {
                    type: (d.actions && d.actions[0]) ? d.actions[0] : '---',
                    timeStr: d.timestamp,
                    people: d.person_count != null ? d.person_count : (d.personCount || 0),
                    fps: d.fps ? d.fps.toFixed(1) : '--',
                    imageFilename: d.image_filename || d.imageFilename || ''
                };
            });
        }
        renderDetTable(dets);
    }

    /* ---- Show initial loading state ---- */
    function showTableLoading() {
        var detBody = document.getElementById('detTableBody');
        var alertBody = document.getElementById('alertTableBody');
        if (detBody) detBody.innerHTML = '<tr><td colspan="6" class="data-status">正在加载数据...</td></tr>';
        if (alertBody) alertBody.innerHTML = '<tr><td colspan="5" class="data-status">正在加载数据...</td></tr>';
    }

    /* ---- CSV export ---- */
    function exportCSV(data, filename) {
        if (!data || data.length === 0) { Common.toast('暂无数据可导出', 'warning'); return; }
        var BOM = '\uFEFF';
        var headers = Object.keys(data[0]);
        var csv = BOM + headers.join(',') + '\n' + data.map(function(row) {
            return headers.map(function(h) {
                return '"' + String(row[h] == null ? '' : row[h]).replace(/"/g, '""') + '"';
            }).join(',');
        }).join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        Common.toast('导出成功: ' + filename, 'success');
    }

    function exportDetections() {
        var dets = (window._latestStatsData && window._latestStatsData.allDetections) ? window._latestStatsData.allDetections : [];
        if (dets.length === 0) { Common.toast('暂无检测数据', 'warning'); return; }
        var rows = dets.map(function(d) {
            return {
                '时间': d.timestamp || '',
                '类型': (d.actions && d.actions[0]) ? d.actions[0] : '常规检测',
                '人数': d.person_count != null ? d.person_count : (d.personCount || 0),
                'FPS': d.fps ? d.fps.toFixed(1) : '',
                '图片': d.image_filename || d.imageFilename || ''
            };
        });
        exportCSV(rows, '检测记录_' + new Date().toISOString().slice(0, 10) + '.csv');
    }

    /* ---- Image viewer ---- */
    function viewImage(filename, type, time, conf) {
        document.getElementById('viewerTitle').textContent = '检测截图 \u00B7 ' + (type || '');
        var img = document.getElementById('viewerImg');
        if (filename) {
            img.src = API_BASE + '/api/images/' + encodeURIComponent(filename);
        } else {
            img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect fill="#1e293b" width="100%" height="100%"/><text x="50%" y="50%" fill="#94a3b8" font-family="system-ui" font-size="16" text-anchor="middle">暂无截图文件</text></svg>');
        }
        // XSS-safe: build viewer info with DOM API
        var viewerInfo = document.getElementById('viewerInfo');
        viewerInfo.innerHTML = '';
        var items = [
            '\uD83D\uDD50 ' + (time || ''),
            '\uD83C\uDFF7\uFE0F ' + (type || ''),
            '\uD83C\uDFAF FPS ' + (conf || '')
        ];
        items.forEach(function(text) {
            var span = document.createElement('span');
            span.textContent = text;
            viewerInfo.appendChild(span);
        });
        document.getElementById('imageViewer').classList.add('show');
    }

    function closeImageViewer() {
        document.getElementById('imageViewer').classList.remove('show');
    }

    /* ---- Filter modal ---- */
    function showFilterModal() {
        var types = ['全部', '跌倒', '打架', '离岗', '疲劳', '人员聚集'];
        var selectEl = document.createElement('select');
        selectEl.className = 'form-select';
        selectEl.id = 'filterType';
        types.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            selectEl.appendChild(opt);
        });

        var timeSelect = document.createElement('select');
        timeSelect.className = 'form-select';
        timeSelect.id = 'filterTime';
        [
            { v: 'all', t: '全部' },
            { v: '1h', t: '最近1小时' },
            { v: '6h', t: '最近6小时' },
            { v: '24h', t: '最近24小时' }
        ].forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.v;
            opt.textContent = o.t;
            timeSelect.appendChild(opt);
        });

        var body = document.createElement('div');
        body.className = 'form-row';

        var g1 = document.createElement('div');
        g1.className = 'form-group';
        var l1 = document.createElement('label');
        l1.className = 'form-label';
        l1.textContent = '行为类型';
        g1.appendChild(l1);
        g1.appendChild(selectEl);
        body.appendChild(g1);

        var g2 = document.createElement('div');
        g2.className = 'form-group';
        var l2 = document.createElement('label');
        l2.className = 'form-label';
        l2.textContent = '时间范围';
        g2.appendChild(l2);
        g2.appendChild(timeSelect);
        body.appendChild(g2);

        var footer = document.createElement('div');
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', Common.closeModal);
        footer.appendChild(cancelBtn);

        var applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.textContent = '应用';
        applyBtn.addEventListener('click', applyFilter);
        footer.appendChild(applyBtn);

        Common.openModal('筛选条件', body, footer);
    }

    function applyFilter() {
        var type = document.getElementById('filterType').value;
        var time = document.getElementById('filterTime').value;
        var dets = (window._latestStatsData && window._latestStatsData.allDetections) ? window._latestStatsData.allDetections : [];
        var filtered = dets.slice();
        if (type !== '全部') filtered = filtered.filter(function(d) { return d.actions && d.actions[0] === type; });
        if (time !== 'all') {
            var hours = { '1h': 1, '6h': 6, '24h': 24 }[time];
            var cutoff = Date.now() - hours * 3600000;
            filtered = filtered.filter(function(d) {
                try { return new Date(d.timestamp.replace(/-/g, '/')).getTime() >= cutoff; }
                catch (e) { return true; }
            });
        }
        renderDetTable(filtered.slice(0, 50));
        Common.closeModal();
        Common.toast('筛选完成: ' + filtered.length + '条记录', 'success');
    }

    /* ---- Clear data ---- */
    function showClearConfirm() {
        var body = document.createElement('div');
        body.style.cssText = 'text-align:center;padding:8px 0';
        var icon = document.createElement('div');
        icon.style.cssText = 'font-size:32px;margin-bottom:10px';
        icon.textContent = '\u26A0';
        body.appendChild(icon);
        var title = document.createElement('div');
        title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:6px';
        title.textContent = '确定要清空所有检测数据吗？';
        body.appendChild(title);
        var desc = document.createElement('div');
        desc.style.cssText = 'font-size:11px;color:var(--text-muted)';
        desc.textContent = '此操作不可恢复';
        body.appendChild(desc);

        var footer = document.createElement('div');
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', Common.closeModal);
        footer.appendChild(cancelBtn);
        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.textContent = '确认清空';
        confirmBtn.addEventListener('click', clearAllData);
        footer.appendChild(confirmBtn);

        Common.openModal('确认清空', body, footer);
    }

    async function clearAllData() {
        try {
            var data = await Common.authFetch(API_BASE + '/api/delete_all_images', { method: 'DELETE' });
            Common.toast('数据已清空', 'success');
            Common.closeModal();
            if (typeof window.fetchData === 'function') window.fetchData();
        } catch (e) {
            Common.toast('清空失败', 'error');
        }
    }

    /* ---- Export ---- */
    window.DetectionModule = {
        buildDetRow: buildDetRow,
        renderDetTable: renderDetTable,
        updateDetTable: updateDetTable,
        showTableLoading: showTableLoading,
        exportCSV: exportCSV,
        exportDetections: exportDetections,
        viewImage: viewImage,
        closeImageViewer: closeImageViewer,
        showFilterModal: showFilterModal,
        applyFilter: applyFilter,
        showClearConfirm: showClearConfirm,
        clearAllData: clearAllData
    };
})();

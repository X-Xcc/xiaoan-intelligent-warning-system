/**
 * Alert module — alert table, ticker, Web Audio sound, alert status management.
 * Depends on: common.js (window.Common)
 * Exported as: window.AlertModule
 */
(function() {
    'use strict';

    var Common = window.Common;
    var API_BASE = Common.API_BASE;

    var alertSoundEnabled = localStorage.getItem('alertSound') !== 'off';
    var _audioCtx = null;

    /* ---- Sound toggle ---- */
    function toggleAlertSound() {
        alertSoundEnabled = !alertSoundEnabled;
        localStorage.setItem('alertSound', alertSoundEnabled ? 'on' : 'off');
        var btn = document.getElementById('soundBtn');
        if (btn) btn.textContent = alertSoundEnabled ? '\uD83D\uDD0A 告警声音' : '\uD83D\uDD07 告警静音';
        Common.toast(alertSoundEnabled ? '告警声音已开启' : '告警声音已关闭', 'info');
    }

    /* ---- Play alert sound via Web Audio ---- */
    function playAlertSound() {
        if (!alertSoundEnabled) return;
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
            var osc = _audioCtx.createOscillator();
            var gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.frequency.value = 800;
            osc.type = 'square';
            gain.gain.value = 0.15;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.5);
            osc.stop(_audioCtx.currentTime + 0.5);
        } catch (e) { /* silent */ }
    }

    /* ---- Ticker ---- */
    function showTickerAlert(msg) {
        document.getElementById('alertTickerText').textContent = msg;
        document.getElementById('alertTicker').classList.add('show');
    }

    function dismissTicker() {
        document.getElementById('alertTicker').classList.remove('show');
    }

    /* ---- Flash stat card ---- */
    function flashStatCard(cardId) {
        var card = document.getElementById(cardId);
        if (card) {
            card.classList.remove('alert-active');
            void card.offsetWidth; // force reflow
            card.classList.add('alert-active');
            setTimeout(function() { card.classList.remove('alert-active'); }, 2500);
        }
    }

    /* ---- Test alert ---- */
    function testAlert() {
        var msgs = ['检测到危险行为：跌倒事件！', '检测到打架斗殴！', '检测到离岗行为！', '检测到疲劳作业！'];
        var msg = msgs[Math.floor(Math.random() * msgs.length)];
        showTickerAlert(msg);
        playAlertSound();
        flashStatCard('cardFall');
        Common.toast('告警测试已触发', 'warning');
    }

    /* ---- Alert status management (localStorage) ---- */
    function getAlertStatuses() {
        try { return JSON.parse(localStorage.getItem('alertStatuses') || '{}'); }
        catch (e) { return {}; }
    }

    function setAlertHandled(timestamp, handled) {
        var statuses = getAlertStatuses();
        if (handled) {
            statuses[timestamp] = { handled: true, time: new Date().toISOString() };
        } else {
            delete statuses[timestamp];
        }
        localStorage.setItem('alertStatuses', JSON.stringify(statuses));
    }

    function isAlertHandled(timestamp) {
        return !!getAlertStatuses()[timestamp];
    }

    function toggleAlertStatus(timestamp) {
        var handled = isAlertHandled(timestamp);
        setAlertHandled(timestamp, !handled);
        if (typeof window.fetchData === 'function') window.fetchData();
        Common.toast(handled ? '已标记为未处理' : '已标记为已处理', 'success');
    }

    /* ---- Alert table (XSS-safe, DOM API) ---- */
    function updateAlertTable(data) {
        var tbody = document.getElementById('alertTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        var dets = [];
        if (data && data.allDetections) {
            dets = data.allDetections.filter(function(d) { return d.actions && d.actions.length > 0; }).slice(0, 30);
        }

        var typeCls = {
            '跌倒': 'badge-orange',
            '打架': 'badge-red',
            '离岗': 'badge-blue',
            '疲劳': 'badge-purple',
            '人员聚集': 'badge-green'
        };

        if (dets.length === 0) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.setAttribute('colspan', '5');
            td.style.cssText = 'text-align:center;color:var(--text-muted);padding:18px';
            td.textContent = '暂无告警记录';
            tr.appendChild(td);
            tbody.appendChild(tr);
            Common.setTxt('pendingAlertCount', '0 待处理');
            return;
        }

        var pendingCount = 0;

        dets.forEach(function(d) {
            var action = (d.actions && d.actions[0]) || '未知';
            var cls = typeCls[action] || 'badge-gray';
            var handled = isAlertHandled(d.timestamp);
            if (!handled) pendingCount++;

            var tr = document.createElement('tr');
            if (handled) tr.style.opacity = '.6';

            // Time
            var tdTime = document.createElement('td');
            tdTime.style.cssText = 'font-family:monospace;font-size:11px';
            tdTime.textContent = d.timestamp || '--';
            tr.appendChild(tdTime);

            // Type badge
            var tdType = document.createElement('td');
            var typeSpan = document.createElement('span');
            typeSpan.className = 'badge ' + cls;
            typeSpan.textContent = action;
            tdType.appendChild(typeSpan);
            tr.appendChild(tdType);

            // Person count
            var tdPeople = document.createElement('td');
            var pc = d.person_count != null ? d.person_count : (d.personCount || 0);
            tdPeople.textContent = pc + '人';
            tr.appendChild(tdPeople);

            // Status badge
            var tdStatus = document.createElement('td');
            var statusSpan = document.createElement('span');
            statusSpan.className = handled ? 'badge badge-green' : 'badge badge-orange';
            statusSpan.textContent = handled ? '已处理' : '待处理';
            tdStatus.appendChild(statusSpan);
            tr.appendChild(tdStatus);

            // Action button
            var tdAction = document.createElement('td');
            var btn = document.createElement('button');
            btn.className = handled ? 'btn btn-sm' : 'btn btn-sm btn-success';
            btn.textContent = handled ? '撤回' : '处理';
            btn.addEventListener('click', function() {
                toggleAlertStatus(d.timestamp);
            });
            tdAction.appendChild(btn);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

        Common.setTxt('pendingAlertCount', pendingCount + ' 待处理');
    }

    /* ---- Init sound button state ---- */
    function initSoundButton() {
        var soundBtn = document.getElementById('soundBtn');
        if (soundBtn) soundBtn.textContent = alertSoundEnabled ? '\uD83D\uDD0A 告警声音' : '\uD83D\uDD07 告警静音';
    }

    /* ---- Export ---- */
    window.AlertModule = {
        toggleAlertSound: toggleAlertSound,
        playAlertSound: playAlertSound,
        showTickerAlert: showTickerAlert,
        dismissTicker: dismissTicker,
        flashStatCard: flashStatCard,
        testAlert: testAlert,
        getAlertStatuses: getAlertStatuses,
        setAlertHandled: setAlertHandled,
        isAlertHandled: isAlertHandled,
        toggleAlertStatus: toggleAlertStatus,
        updateAlertTable: updateAlertTable,
        initSoundButton: initSoundButton,
        isEnabled: function() { return alertSoundEnabled; }
    };
})();

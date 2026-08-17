import { SlideAddons } from '../slides-addons.js?v=2';
import { Timeline } from '../sandbox/timeline.js';

/**
 * Static Timeline Addon
 * Scans for `static-timeline` markdown code blocks and replaces them with an embedded canvas Timeline.
 */
SlideAddons.registerBlockPlugin('static-timeline', (config, body) => {
    try {
        const timelineConfig = JSON.parse(body.trim());

        // Generate mock Engine matching `Timeline`'s expectations
        const mockEngine = {
            maxTicks: timelineConfig.ticks || 100,
            servers: [],
            history: [],
            messages: []
        };

        // 1. Setup Servers
        const serverNames = timelineConfig.servers || [];
        serverNames.forEach((name, id) => {
            mockEngine.servers.push({
                id: id,
                name: name,
                color: null, // Let Timeline pick up --text-color dynamically
                crashIntervals: []
            });
        });

        // 2. Setup Crashes
        if (timelineConfig.crashes) {
            timelineConfig.crashes.forEach(c => {
                const sId = serverNames.indexOf(c.server);
                if (sId !== -1) {
                    mockEngine.servers[sId].crashIntervals.push([c.start, c.end]);
                }
            });
        }

        // 3. Initialize History Array
        for (let t = 0; t <= mockEngine.maxTicks + 1; t++) {
            mockEngine.history.push({ serverStates: {} });
        }

        // 4. Paint States into History
        if (timelineConfig.states) {
            timelineConfig.states.forEach(st => {
                const sId = serverNames.indexOf(st.server);
                if (sId !== -1) {
                    for (let t = st.start; t <= st.end; t++) {
                        if (!mockEngine.history[t]) continue;
                        if (!mockEngine.history[t].serverStates[sId]) {
                            mockEngine.history[t].serverStates[sId] = { fsm: { state: null, colors: {} } };
                        }
                        mockEngine.history[t].serverStates[sId].fsm.state = st.state;
                        mockEngine.history[t].serverStates[sId].fsm.colors[st.state] = st.color || '#ccc';
                    }
                }
            });
        }

        // 5. Setup Messages
        if (timelineConfig.messages) {
            timelineConfig.messages.forEach(m => {
                mockEngine.messages.push({
                    from: serverNames.indexOf(m.from),
                    to: serverNames.indexOf(m.to),
                    sendTick: m.sendTick,
                    arrivalTick: m.recvTick,
                    lost: !!m.lost
                });
            });
        }

        mockEngine.config = timelineConfig;

        let containerStyle = 'overflow-x: auto; margin-top: 20px; margin-bottom: 20px; transition: background 0.3s, border 0.3s;';
        
        if (timelineConfig.float) {
            if (timelineConfig.float === 'center') {
                containerStyle += ' margin-left: auto; margin-right: auto; float: none; display: block;';
            } else {
                containerStyle += ` float: ${timelineConfig.float}; margin: 15px; margin-top: 5px;`;
            }
        }
        if (timelineConfig.width) {
            containerStyle += ` width: ${timelineConfig.width};`;
        }
        
        if (config.css) containerStyle += ` ${config.css}`;
        const classAttr = config.classes.length > 0 ? ` static-timeline-wrapper ${config.classes.join(' ')}` : ` static-timeline-wrapper`;

        const containerId = 'timeline_' + Math.random().toString(36).substring(2, 9);
        const canvasId = containerId + '_canvas';

        return `<div id="${containerId}" class="${classAttr.trim()}" style="${containerStyle.trim()}">
            <canvas id="${canvasId}"></canvas>
        </div>
        <script type="module">
            import { Timeline } from './engine/js/sandbox/timeline.js';
            const canvas = document.getElementById('${canvasId}');
            if (canvas) {
                const timeline = new Timeline(canvas, null);
                timeline.hideScrubber = true;
                timeline.setEngine(${JSON.stringify(mockEngine)});
                timeline.scale = ${timelineConfig.scale || 20};
                ${timelineConfig.zoom ? `timeline.zoom = ${timelineConfig.zoom};` : ''}
                timeline.resize();
                timeline.draw();
                window.addEventListener('theme-change', () => timeline.draw());
            }
        </script>`;
    } catch (err) {
        console.error('Failed to parse static-timeline JSON:', err);
        return `<div style="color: #c62828;">Error rendering static timeline.<br>${err.message}</div>`;
    }
});

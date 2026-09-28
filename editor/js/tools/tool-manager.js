import { initGeometryTool } from './geometry-tool.js';
import { initImageTool } from './image-tool.js';
import { initReactTool } from './react-tool.js';

export function initTools() {
    console.log("Tools initialized.");
    initGeometryTool();
    initImageTool();
    initReactTool();
}

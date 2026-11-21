// Plain-English reason for the controller's current mode, from its own thresholds.
import { MODES, DEFAULT_CONFIG } from "../control/engine.js";

export function modeReason(r, x, c = DEFAULT_CONFIG) {
  switch (r.mode) {
    case MODES.STORM: return x.windSpeedMs >= c.windStormMs
      ? `Wind ${x.windSpeedMs.toFixed(1)} m/s is above the ${c.windStormMs} m/s storm threshold${x.rainfallMmHr >= c.rainStormMmHr ? `, and rain ${x.rainfallMmHr.toFixed(1)} mm/h is above ${c.rainStormMmHr}` : ""}.`
      : `Rain ${x.rainfallMmHr.toFixed(1)} mm/h is above the ${c.rainStormMmHr} mm/h storm threshold.`;
    case MODES.CLEANING: return `Dust loss ${Math.round(x.soilingIndex * 100)}% passed the ${Math.round(c.cleaningAutoThreshold * 100)}% trigger, and wind, sun, panel temperature and tank level are all inside the safe envelope.`;
    case MODES.CONSERVE: return !x.gridAvailable ? "The grid is unavailable, so the battery reserve rises to 35% and only the home is supplied." : `Battery at ${Math.round(x.batterySoc)}% is close to its reserve.`;
    case MODES.FAULT: return "A critical interlock tripped: generation, storage and grid contactors are open until it clears.";
    case MODES.STARTUP: return "The controller is validating sensors and actuator interlocks before taking control.";
    case MODES.MANUAL: return "A supervisor has taken control. Safety interlocks still override every command.";
    default: return "No storm, fault, dust or outage condition is active, so the normal routing order applies.";
  }
}

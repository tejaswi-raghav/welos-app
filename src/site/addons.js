import { sizeSystem } from "./sizing.js";

// Compare complete builds so the price includes linked changes such as an
// inverter upgrade, tank sizing or an array resized after a cleaning choice.
export function getAddOns(result) {
  const by = Object.fromEntries(result.components.map((part) => [part.id, part]));
  const request = result.request;
  const definitions = [
    { id: "condensate", name: "AC condensate recovery", on: by.condensate.included, recommended: by.condensate.recommended,
      detail: "Recover AC condensate for suitable non-potable uses. Leave it out if that water is not useful to your building." },
    { id: "cleaning", name: "Automatic panel cleaning", on: by.cleaning.metrics.autoClean, recommended: result.package.cleaning === "auto",
      detail: "Without this add-on, soiling alerts stay included and cleaning is manual. The output estimate assumes regular manual cleaning." },
    { id: "treatment", name: "Advanced water treatment", on: by.water.metrics.fullTreatment, recommended: !result.package.waterLite,
      detail: "Adds carbon filtration and UV-C. First flush, tank, sediment filter and pump stay included without it. Choose treatment for the intended use. Neither option is for drinking water." },
    { id: "battery", name: "Battery storage", on: by.battery.included, recommended: by.battery.recommended,
      detail: "Adds essential-load backup and a hybrid inverter. Without a battery, the grid-tied system has no outage backup." },
    { id: "wind", name: "Vertical-axis wind turbine", on: by.wind.included, recommended: by.wind.recommended,
      detail: "Add only after measuring the rooftop wind resource. The estimate is not a measured turbine yield." },
  ];
  return definitions.map((option) => {
    const alternative = sizeSystem(request.climate, request.tierId, request.inputs,
      { ...request.choices, [option.id]: !option.on }, request.packageId, request.context);
    const enabled = option.on ? result : alternative;
    const disabled = option.on ? alternative : result;
    const part = enabled.components.find((p) => p.id === (option.id === "treatment" ? "water" : option.id));
    return {
      ...option,
      part,
      hardwareAed: enabled.totals.hardwareAed - disabled.totals.hardwareAed,
      installedAed: enabled.totals.totalAed - disabled.totals.totalAed,
      energyKwhYear: enabled.totals.energyKwhYear - disabled.totals.energyKwhYear,
      waterLYear: enabled.totals.waterLYear - disabled.totals.waterLYear,
      waterDemandPct: disabled.site.waterLDay > 0
        ? ((enabled.totals.waterLYear - disabled.totals.waterLYear) / (disabled.site.waterLDay * 365)) * 100 : 0,
    };
  });
}

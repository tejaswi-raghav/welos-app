import { sizeSystem } from "./sizing.js";

// Compare complete builds so the price includes linked changes such as an
// inverter upgrade, tank sizing or an array resized after a cleaning choice.
export function getAddOns(result) {
  const by = Object.fromEntries(result.components.map((part) => [part.id, part]));
  const request = result.request;
  // `suggested` states the engine's reason in a few words, so the tag never implies more than the logic does
  const definitions = [
    { id: "condensate", name: "AC condensate recovery", on: by.condensate.included, available: by.condensate.available, unavailableWhy: by.condensate.unavailableWhy,
      suggested: by.condensate.recommended ? "Suggested: hot and humid enough to be worth collecting" : null,
      detail: "Recover AC condensate for suitable non-potable uses. Leave it out if that water is not useful to your building." },
    { id: "cleaning", name: "Automatic panel cleaning", on: by.cleaning.metrics.autoClean, available: true,
      suggested: result.package.cleaning === "auto" ? `Default in ${result.package.name}` : null,
      detail: "Without this add-on, soiling alerts stay included and cleaning is manual. The output estimate assumes regular manual cleaning." },
    { id: "treatment", name: "Advanced water treatment", on: by.water.metrics.fullTreatment, available: by.water.available, unavailableWhy: by.water.unavailableWhy,
      suggested: result.hasWater && !result.package.waterLite ? `Default in ${result.package.name}` : null,
      detail: "Adds carbon filtration and UV-C. First flush, tank, sediment filter and pump stay included without it. Choose treatment for the intended use. Neither option is for drinking water." },
    { id: "battery", name: "Battery storage", on: by.battery.included, available: true,
      suggested: by.battery.recommended ? (result.request.context?.backup ? "Suggested: you asked for outage backup" : "Suggested: pays back within 10 years") : null,
      detail: "Adds essential-load backup and a hybrid inverter. Without a battery, the grid-tied system has no outage backup." },
    { id: "wind", name: "Vertical-axis wind turbine", on: by.wind.included, available: true,
      suggested: by.wind.recommended ? "Suggested: hub-height wind ≥ 4.5 m/s" : null,
      detail: "Add only after measuring the rooftop wind resource. The estimate is not a measured turbine yield." },
  ];
  return definitions.map((option) => {
    const part0 = by[option.id === "treatment" ? "water" : option.id];
    if (!option.available) return { ...option, recommended: false, part: part0, hardwareAed: 0, installedAed: 0, energyKwhYear: 0, waterLYear: 0, waterDemandPct: 0 };
    const alternative = sizeSystem(request.climate, request.tierId, request.inputs,
      { ...request.choices, [option.id]: !option.on }, request.packageId, request.context);
    const enabled = option.on ? result : alternative;
    const disabled = option.on ? alternative : result;
    const part = enabled.components.find((p) => p.id === (option.id === "treatment" ? "water" : option.id));
    return {
      ...option,
      recommended: !!option.suggested,
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

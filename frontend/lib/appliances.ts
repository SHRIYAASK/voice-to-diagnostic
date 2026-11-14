export interface ApplianceCategory {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  models: Array<{ id: string; name: string; specs: string }>;
  commonIssues: Array<{
    id: string;
    title: string;
    description: string;
    quickFix: string;
    requiresTech: boolean;
  }>;
  errorCodes: Array<{
    code: string;
    display: string;
    category: string;
    description: string;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    customer_action: string;
    technician_action: string;
    likely_parts: string[];
    safety_flag: boolean;
  }>;
  maintenanceTips: Array<{
    title: string;
    frequency: string;
    instructions: string[];
  }>;
}

export const APPLIANCE_CATEGORIES: ApplianceCategory[] = [
  {
    id: 'air-conditioner',
    name: 'Air Conditioner',
    shortName: 'AC',
    icon: '❄️',
    description: 'Inverter Split & Window ACs. Cooling, airflow, compressor & electrical diagnostics.',
    models: [
      { id: 'AC-WIN-15', name: '1.5-Ton Window Dual Inverter (UW-Q18WUZA)', specs: 'Dual Rotary, R32 Refrigerant, Copper Condenser' },
      { id: 'AC-SPL-15', name: '1.5-Ton 5-Star Split Dual Inverter (MS-Q18YNZA)', specs: 'Variable Speed Inverter, Convertible 6-in-1, Active 4-way Swing' },
      { id: 'AC-SPL-20', name: '2.0-Ton Heavy Duty Split Inverter', specs: 'High Ambient 54°C Tonnage, Micro-Dust Protection' },
    ],
    commonIssues: [
      { id: 'ac-not-cooling', title: 'AC Not Cooling / Warm Air Flow', description: 'Blowing ambient or warm air despite thermostat set to 18°C.', quickFix: 'Clean nylon air filters, verify Mode is Cool and temperature is 5°C below room temperature.', requiresTech: false },
      { id: 'ac-water-leak', title: 'Water Dripping Indoors', description: 'Water overflowing from front grill or indoor bottom tray.', quickFix: 'Check drain hose slope for kinks or algae blockage. Ensure unit is tilted slightly backward.', requiresTech: false },
      { id: 'ac-mcb-trip', title: 'MCB / Power Tripping on Start', description: 'Circuit breaker trips instantly when outdoor compressor engages.', quickFix: 'Do not repeatedly reset breaker. Disconnect mains power immediately.', requiresTech: true },
      { id: 'ac-noise', title: 'Unusual Rattling or Humming Noise', description: 'Loud vibration from cabinet or outdoor fan motor.', quickFix: 'Inspect front panel latches and exterior mounting brackets.', requiresTech: false },
    ],
    errorCodes: [
      { code: 'CH05', display: 'CH 05', category: 'Communication', description: 'Serial communication failure between indoor and outdoor inverter control boards.', severity: 'High', customer_action: 'Trip MCB power for 5 minutes and restart. If persistent, book service.', technician_action: 'Check 28V DC communication waveform and terminal block wiring.', likely_parts: ['Communication Cable', 'Outdoor Inverter PCB'], safety_flag: false },
      { code: 'CH38', display: 'CH 38', category: 'Refrigerant', description: 'Low refrigerant charge detected by sub-cooling temperature sensor.', severity: 'High', customer_action: 'Stop operation immediately to prevent compressor burn-out. Book service.', technician_action: 'Pressure test with dry nitrogen, inspect flare nuts, recharge R32.', likely_parts: ['Copper Flare Nuts', 'R32 Refrigerant Gas'], safety_flag: false },
      { code: 'CL', display: 'CL', category: 'Operational', description: 'Child Lock active on remote controller / front panel.', severity: 'Low', customer_action: 'Press and hold Timer / Mode button for 3 seconds to unlock.', technician_action: 'None required.', likely_parts: [], safety_flag: false },
      { code: 'FL', display: 'FL', category: 'Maintenance', description: 'Filter clean reminder timer reached (every 350 operational hours).', severity: 'Low', customer_action: 'Remove mesh filter, wash under lukewarm tap water, dry completely, reset indicator.', technician_action: 'Inspect evaporator coil face for buildup.', likely_parts: [], safety_flag: false },
    ],
    maintenanceTips: [
      { title: '15-Day Filter Washing', frequency: 'Bi-Weekly', instructions: ['Slide out mesh filters from front panel.', 'Rinse under lukewarm running water (under 40°C).', 'Air dry in shade before reinstalling. Never run AC without filters.'] },
      { title: 'Outdoor Coil Clearance', frequency: 'Monthly', instructions: ['Ensure 50cm clearance around rear and side outdoor coils.', 'Clear dried leaves, plastic debris, or bird netting blocks.'] },
    ],
  },
  {
    id: 'refrigerator',
    name: 'Refrigerator',
    shortName: 'Fridge',
    icon: '🧊',
    description: 'Frost-Free & Direct Cool Refrigerator diagnostics. Temperature, defrost, ice maker & door seals.',
    models: [
      { id: 'REF-FF-340', name: '340L Double Door Frost-Free Smart Inverter', specs: 'Multi Air Flow, Door Cooling+, Smart Diagnosis' },
      { id: 'REF-SBS-680', name: '680L Side-by-Side Inverter with Water Dispenser', specs: 'Dual Inverter Linear Compressor, Express Freeze' },
      { id: 'REF-DC-190', name: '190L Single Door Direct Cool', specs: 'Fastest in Ice Making, Toughened Glass Shelves' },
    ],
    commonIssues: [
      { id: 'ref-warm-compartment', title: 'Fridge Compartment Too Warm', description: 'Freezer is cold but lower refrigerator compartment food is spoiling.', quickFix: 'Check if air vents on rear wall are blocked by large containers. Set slider damper to Normal.', requiresTech: false },
      { id: 'ref-frost-build', title: 'Excessive Ice Buildup on Freezer Coils', description: 'Snow-like frost covering freezer rear panel causing fan motor noise.', quickFix: 'Inspect door gasket for air leaks using paper test. Perform full 8-hour manual defrost.', requiresTech: false },
      { id: 'ref-water-leak', title: 'Water Pooling Beneath Vegetable Crisper', description: 'Water accumulating inside bottom tray instead of evaporating in rear pan.', quickFix: 'Clear internal defrost drain hole using warm water and a flexible plastic tube.', requiresTech: false },
      { id: 'ref-clicking', title: 'Compressor Clicking Every 2 Minutes', description: 'Inverter compressor clicks, hums for 5 seconds, and cuts out.', quickFix: 'Verify wall outlet voltage is between 210V-240V. Turn off for 30 minutes.', requiresTech: true },
    ],
    errorCodes: [
      { code: 'ErFF', display: 'Er FF', category: 'Cooling Fan', description: 'Freezer evaporator fan motor stall or blade obstruction from frost.', severity: 'High', customer_action: 'Unplug refrigerator for 6 hours to melt ice block. If code returns, book technician.', technician_action: 'Check 12V DC fan motor coil resistance and inspect wiring harness.', likely_parts: ['Freezer Fan Motor', 'Defrost Thermistor'], safety_flag: false },
      { code: 'ErdH', display: 'Er dH', category: 'Defrost Circuit', description: 'Defrost cycle exceeded 60 minutes without reaching defrost termination temperature.', severity: 'High', customer_action: 'Book authorized technician. Defrost heater or fuse requires multimeter inspection.', technician_action: 'Test defrost heater resistance (around 150-250 ohms) and bimetal thermal fuse.', likely_parts: ['Sheath Defrost Heater', 'Thermal Fuse (72°C)'], safety_flag: false },
      { code: 'ErCF', display: 'Er CF', category: 'Condenser Fan', description: 'Condenser fan motor located near compressor in machine compartment is stalled.', severity: 'Medium', customer_action: 'Vacuum dust from rear lower metal cover vents.', technician_action: 'Clean lint from condenser coil and replace BLDC condenser fan if open.', likely_parts: ['Condenser Fan Motor'], safety_flag: false },
      { code: 'ErCO', display: 'Er CO', category: 'Communication', description: 'Serial communication fault between front door display panel and main control board.', severity: 'Medium', customer_action: 'Cycle main wall power switch off for 5 minutes.', technician_action: 'Inspect top door hinge wiring harness for pinched or broken conductors.', likely_parts: ['Door Hinge Wiring Loom', 'Main PCB'], safety_flag: false },
    ],
    maintenanceTips: [
      { title: 'Door Gasket Seal Inspection', frequency: 'Monthly', instructions: ['Close door on a sheet of paper. If it pulls out with zero resistance, seal is leaking.', 'Wipe magnetic rubber gasket with warm soapy water to remove sticky spills.'] },
      { title: 'Rear Condenser Coil Vacuuming', frequency: 'Every 6 Months', instructions: ['Unplug power cord.', 'Remove lower rear metal grill and gently vacuum pet hair and dust lint.'] },
    ],
  },
  {
    id: 'washing-machine',
    name: 'Washing Machine',
    shortName: 'Washer',
    icon: '🧺',
    description: 'Front-Load & Top-Load Washing Machine troubleshooting. Drain pumps, drum balance, water inlet & drive motors.',
    models: [
      { id: 'WM-FL-80', name: '8.0 Kg Front Load AI Direct Drive', specs: 'Inverter Direct Drive, 6 Motion DD, Steam Wash' },
      { id: 'WM-TL-75', name: '7.5 Kg Top Load Smart Inverter', specs: 'Smart Motion, TurboDrum, Punch+3 Pulsator' },
      { id: 'WM-SA-85', name: '8.5 Kg Semi-Automatic Twin Tub', specs: 'Roller Jet Pulsator, Rat Away Technology' },
    ],
    commonIssues: [
      { id: 'wm-not-draining', title: 'Water Not Draining Out (OE Error)', description: 'Tub remains filled with soapy water at the end of wash cycle.', quickFix: 'Open bottom front service hatch, unscrew drain pump filter, and clear coins/lint.', requiresTech: false },
      { id: 'wm-violent-spin', title: 'Severe Shaking / Walking During Spin (UE)', description: 'Machine thumps loudly and pauses spin cycle repeatedly.', quickFix: 'Evenly distribute heavy items (blankets, jeans). Check that all 4 levelling feet touch floor solidly.', requiresTech: false },
      { id: 'wm-water-slow', title: 'Very Slow Water Filling (IE Error)', description: 'Takes longer than 15 minutes to reach required water level.', quickFix: 'Turn off tap, disconnect inlet hose, and clean mesh filter screen with a soft toothbrush.', requiresTech: false },
      { id: 'wm-door-locked', title: 'Door Won’t Open After Cycle Finished', description: 'Door remains firmly latched even after water has completely drained.', quickFix: 'Wait 3 minutes for thermal lock release. Use emergency pull tab inside bottom hatch.', requiresTech: false },
    ],
    errorCodes: [
      { code: 'OE', display: 'OE', category: 'Drainage', description: 'Water unable to drain from drum within 10 minutes of drain phase.', severity: 'Medium', customer_action: 'Clean debris filter at bottom front. Check drain pipe for kinks or height above 1m.', technician_action: 'Inspect drain pump motor winding (approx 160 ohms) and clear sump hose block.', likely_parts: ['Drain Pump Assembly', 'Pressure Switch Hose'], safety_flag: false },
      { code: 'UE', display: 'UE', category: 'Balance', description: 'Unbalanced load detected. Drum unable to safely ramp up to high spin speed.', severity: 'Low', customer_action: 'Redistribute tangled wet clothing evenly across drum. Ensure machine is level.', technician_action: 'Inspect suspension damper friction pads and drum spider bracket.', likely_parts: ['Friction Dampers', 'Drum Springs'], safety_flag: false },
      { code: 'IE', display: 'IE', category: 'Water Supply', description: 'Water level did not rise within 8 minutes of water inlet valves opening.', severity: 'Low', customer_action: 'Ensure water tap is turned fully on. Clean inlet valve mesh screens.', technician_action: 'Test inlet solenoid valve resistance (approx 3.5k-4.5k ohms).', likely_parts: ['Dual Inlet Solenoid Valve'], safety_flag: false },
      { code: 'dE', display: 'dE / dE1', category: 'Door Lock', description: 'Door latch or interlock microswitch not registering closed position.', severity: 'Medium', customer_action: 'Firmly close door until audible click. Ensure clothes are not caught in rubber gasket.', technician_action: 'Check PTC door lock switch continuity and inspect door strike hook.', likely_parts: ['Electronic Door Lock Mechanism'], safety_flag: false },
      { code: 'LE', display: 'LE', category: 'Motor Overload', description: 'Direct Drive motor locked or hall sensor tachometer signal missing.', severity: 'High', customer_action: 'Reduce oversized laundry load. Power off for 30 minutes.', technician_action: 'Test Hall sensor output voltages and stator motor winding balance.', likely_parts: ['RPS Hall Sensor', 'Stator Motor Assembly'], safety_flag: false },
    ],
    maintenanceTips: [
      { title: 'Drain Pump Filter Cleanout', frequency: 'Monthly', instructions: ['Place a shallow tray under lower service flap.', 'Unclip emergency drain tube to empty residual water.', 'Unscrew filter cap counter-clockwise and remove lint, coins, and hair.'] },
      { title: 'Tub Clean Cycle', frequency: 'Monthly', instructions: ['Run dedicated Tub Clean cycle with 1 cup white vinegar or descaling tablet.', 'Wipe rubber door bellows dry after every wash to prevent mildew.'] },
    ],
  },
  {
    id: 'microwave-oven',
    name: 'Microwave Oven',
    shortName: 'Microwave',
    icon: '🍲',
    description: 'Convection, Grill & Solo Microwave safety and heating checks. High-voltage magnetron, turntable & door switches.',
    models: [
      { id: 'MW-CV-28', name: '28L Convection Smart Inverter', specs: 'Charcoal Lighting Heater, Diet Fry, Stainless Cavity' },
      { id: 'MW-GR-20', name: '20L Grill Microwave', specs: 'Quartz Heater, Anti-Bacterial EasyClean Cavity' },
      { id: 'MW-SO-20', name: '20L Solo Microwave', specs: 'Even Heating & Defrosting, Energy Saving Eco-On' },
    ],
    commonIssues: [
      { id: 'mw-no-heat', title: 'Runs Normal But Food Remains Cold', description: 'Timer counts down, turntable turns, fan hums, but zero heat produced.', quickFix: 'Never open internal cabinet — high voltage capacitor carries lethal charge.', requiresTech: true },
      { id: 'mw-sparking', title: 'Sparks / Arcing Inside Cavity', description: 'Bright sparks snapping near right-hand wall inside microwave.', quickFix: 'Immediately stop. Inspect mica waveguide cover for grease splatters or metal foil.', requiresTech: false },
      { id: 'mw-turntable-stuck', title: 'Glass Turntable Not Rotating', description: 'Plate slips or chatters in place while food heats unevenly.', quickFix: 'Clean underneath roller guide ring and verify glass plate central hub is seated on drive coupler.', requiresTech: false },
      { id: 'mw-keypad-dead', title: 'Start Button or Keypad Unresponsive', description: 'Display lights up with clock, but buttons do not register touches.', quickFix: 'Check if Child Lock is active (hold Stop/Clear for 3s). Wipe membrane keypad dry.', requiresTech: false },
    ],
    errorCodes: [
      { code: 'F-1', display: 'F-1', category: 'Thermal Sensor', description: 'Cavity temperature sensor / thermistor open or short circuit during convection.', severity: 'High', customer_action: 'Unplug unit. Book service.', technician_action: 'Test NTC thermistor resistance (approx 100k ohms at 25°C).', likely_parts: ['Cavity Thermistor'], safety_flag: true },
      { code: 'F-2', display: 'F-2', category: 'Keypad Membrane', description: 'Short-circuited touch key detected continuously for more than 30 seconds.', severity: 'Medium', customer_action: 'Clean surface of control panel. Unplug for 10 minutes.', technician_action: 'Inspect ribbon cable connector and replace touch panel assembly.', likely_parts: ['Membrane Switch Panel'], safety_flag: false },
      { code: 'F-3', display: 'F-3', category: 'Thermal Trip', description: 'Magnetron or cavity thermal cutout switch tripped due to overheating.', severity: 'Critical', customer_action: 'Ensure 15cm ventilation space around top and sides of microwave. Do not operate.', technician_action: 'Test cooling fan motor speed and magnetron thermal cut-out continuity.', likely_parts: ['Thermal Cutout (TCO)', 'Exhaust Blower Motor'], safety_flag: true },
    ],
    maintenanceTips: [
      { title: 'Mica Waveguide Cover Care', frequency: 'Weekly', instructions: ['Wipe mica card on right wall with damp cloth to remove sauce splatters.', 'If mica plate is scorched, burned, or flaking, replace immediately to avoid magnetron arcing.'] },
      { title: 'Door Latch & Seal Inspection', frequency: 'Monthly', instructions: ['Inspect door mesh screen and perimeter chokes for food crust or dents.', 'Ensure both door latch prongs snap securely into interlock slots.'] },
    ],
  },
  {
    id: 'dishwasher',
    name: 'Dishwasher',
    shortName: 'Dishwasher',
    icon: '🍽️',
    description: 'Built-in & Freestanding Dishwasher diagnostics. Spray arms, water heating, leak sensors & drainage pumps.',
    models: [
      { id: 'DW-TS-14', name: '14 Place TrueSteam QuadWash Dishwasher', specs: 'Inverter Direct Drive, SmartThinQ Wifi, EasyRack Plus' },
      { id: 'DW-FS-12', name: '12 Place Freestanding Smart Dishwasher', specs: 'Dual Zone Wash, Turbo Cycle, Stainless Steel Tub' },
    ],
    commonIssues: [
      { id: 'dw-water-tub', title: 'Standing Water in Bottom of Tub', description: 'Dishes done but 2 inches of dirty water pooled in bottom basin.', quickFix: 'Twist out bottom cylinder filter and mesh screen; rinse out trapped food residue.', requiresTech: false },
      { id: 'dw-cloudy-dishes', title: 'Dishes Have White Film or Spotting', description: 'Glassware looks cloudy or gritty after drying.', quickFix: 'Refill rinse aid dispenser. Check dishwasher salt level if using hard water.', requiresTech: false },
      { id: 'dw-spray-stuck', title: 'Upper Spray Arm Not Rotating', description: 'Dishes in top rack stay dirty with dried food remaining.', quickFix: 'Unclip spray arm and use a toothpick to clear mineral deposits from tiny spray nozzles.', requiresTech: false },
      { id: 'dw-leak-alarm', title: 'Beeping Continuously with AE / EI Error', description: 'Base pan water sensor detected moisture beneath tub.', quickFix: 'Turn off water supply valve. Unplug power cord.', requiresTech: true },
    ],
    errorCodes: [
      { code: 'OE', display: 'OE', category: 'Drainage', description: 'Drain pump timed out without emptying sump water within 5 minutes.', severity: 'Medium', customer_action: 'Clean bottom micro-filter. Check sink drain pipe connection for blockage.', technician_action: 'Inspect drain pump impeller for broken glass shards or winding burnout.', likely_parts: ['BLDC Drain Pump', 'Non-Return Flapper Valve'], safety_flag: false },
      { code: 'IE', display: 'IE', category: 'Inlet Valve', description: 'Water level frequency not reached by pressure switch within 10 minutes.', severity: 'Low', customer_action: 'Check that water shut-off valve is open and inlet hose is not kinked.', technician_action: 'Inspect aqua-stop inlet valve flow rate and test solenoid coil.', likely_parts: ['Aqua-Stop Inlet Hose Valve'], safety_flag: false },
      { code: 'AE', display: 'AE / EI', category: 'Leak Detection', description: 'Aqua-stop float sensor in bottom safety drip tray has detected liquid leakage.', severity: 'Critical', customer_action: 'Shut off water supply valve under sink immediately. Disconnect mains power.', technician_action: 'Remove base access plate, trace leak origin (sump gasket, hose clamp, or door seal).', likely_parts: ['Sump Gasket', 'Circulation Pump Hose Clamp'], safety_flag: true },
      { code: 'bE', display: 'bE', category: 'Soap Suds', description: 'Excessive soap bubbles or hand dishwashing soap accidentally added.', severity: 'Low', customer_action: 'Pour 1/2 cup cooking oil into bottom tub to break bubbles, run drain cycle.', technician_action: 'None required unless soap overflow entered base pan.', likely_parts: [], safety_flag: false },
    ],
    maintenanceTips: [
      { title: 'Triple Stage Sump Filter Rinse', frequency: 'Weekly', instructions: ['Rotate central cylindrical filter counter-clockwise and lift out.', 'Rinse under warm running water with soft brush to clear grease.', 'Reinstall and lock clockwise until arrow marks align.'] },
      { title: 'Spray Arm Nozzle Cleaning', frequency: 'Monthly', instructions: ['Unclip lower and upper spray arms.', 'Flush warm water through center hole and dislodge seeds or lemon pips from spray tips.'] },
    ],
  },
];

export function getApplianceById(id: string): ApplianceCategory {
  return APPLIANCE_CATEGORIES.find((a) => a.id === id) || APPLIANCE_CATEGORIES[0];
}

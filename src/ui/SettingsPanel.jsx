import { useCallback, useRef, useState } from 'react';
import {
  cmPer360,
  degreesPerCount,
  sensitivityToSlider,
  sliderToSensitivity,
} from '../input/SensitivityController.js';
import { SCHEMA, runProfile } from '../settings/SettingsSchema.js';
import { THEMES, targetPalette } from '../rendering/themes.js';
import { settingsStore } from '../settings/settingsStore.js';
import { RawInputStatus } from '../input/PointerLockManager.js';
import { ColorField, ConfirmButton, NumberField, Segmented, SettingRow, SliderField, Toggle, VernierSlider } from './controls.jsx';
import { CrosshairEditor } from './CrosshairEditor.jsx';
import { useApp, useEntrance, useEscape, useGame, useSettings } from './hooks.js';

const CATEGORIES = [
  { id: 'mouse', label: 'Mouse' },
  { id: 'camera', label: 'Camera' },
  { id: 'crosshair', label: 'Crosshair' },
  { id: 'targets', label: 'Targets' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'interface', label: 'Interface' },
];

const RAW_INPUT_TEXT = {
  [RawInputStatus.UNKNOWN]: 'Bypasses OS mouse acceleration where supported. Status appears after your first session.',
  [RawInputStatus.ACTIVE]: 'Active. The browser is reporting movement with OS acceleration bypassed.',
  [RawInputStatus.OFF]: 'Off. Movement follows your OS pointer settings.',
  [RawInputStatus.UNAVAILABLE]: "This browser or system didn't provide raw input, so movement follows your OS pointer settings.",
};

function MouseSettings({ values, update }) {
  const rawStatus = useApp((state) => state.rawInputStatus);
  const set = (key) => (value) => update('mouse', key, value);
  const { min, max } = SCHEMA.mouse.sensitivity;
  const cm = cmPer360(values.sensitivity, values.dpi);

  return (
    <>
      <SettingRow label="Sensitivity" hint="Rotation per mouse count. Never scaled by frame rate.">
        <div className="flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <VernierSlider
              label="Sensitivity"
              value={values.sensitivity}
              onChange={(value) => set('sensitivity')(Number(value.toFixed(3)))}
              fromPosition={(position) => sliderToSensitivity(position, min, max)}
              toPosition={(value) => sensitivityToSlider(value, min, max)}
              valueText={values.sensitivity.toFixed(3)}
            />
          </div>
          <NumberField
            label="Sensitivity, exact value"
            value={values.sensitivity}
            min={min}
            max={max}
            step={0.001}
            decimals={3}
            onChange={set('sensitivity')}
          />
        </div>
      </SettingRow>
      <SettingRow label="Rotation per count">
        <span className="type-readout text-base" data-testid="degrees-per-count">
          {degreesPerCount(values.sensitivity).toFixed(4)}°
        </span>
      </SettingRow>
      <SettingRow
        label="Mouse DPI"
        hint="Only used for the estimate below. It doesn't change your aim."
      >
        <NumberField label="Mouse DPI" value={values.dpi} min={100} max={32000} step={50} onChange={set('dpi')} />
      </SettingRow>
      <SettingRow
        label="Estimated distance per 360°"
        hint="An estimate, assuming your mouse really reports this DPI and nothing rescales it. Measure it on your desk to be sure."
      >
        <span className="type-readout text-base" data-testid="cm-per-360">
          {cm.toFixed(1)} cm
        </span>
      </SettingRow>
      <SettingRow label="Vertical sensitivity" hint="Multiplier for up and down movement. 1.00 matches horizontal.">
        <SliderField label="Vertical sensitivity" value={values.verticalMultiplier} min={0.2} max={3} step={0.01} decimals={2} onChange={set('verticalMultiplier')} />
      </SettingRow>
      <SettingRow label="Invert vertical">
        <Toggle label="Invert vertical" checked={values.invertY} onChange={set('invertY')} />
      </SettingRow>
      <SettingRow label="Raw input" hint={RAW_INPUT_TEXT[values.rawInput ? rawStatus : RawInputStatus.OFF]}>
        <Toggle label="Raw input" checked={values.rawInput} onChange={set('rawInput')} />
      </SettingRow>
    </>
  );
}

function CameraSettings({ values, update }) {
  const set = (key) => (value) => update('camera', key, value);
  return (
    <>
      <SettingRow label="Field of view" hint="Horizontal. Changes how much of the room you see, not your turn rate.">
        <SliderField label="Field of view" value={values.fov} min={60} max={120} step={1} suffix="°" onChange={set('fov')} />
      </SettingRow>
      <SettingRow label="Vertical look limit" hint="How far you can look up and down from level.">
        <SliderField label="Vertical look limit" value={values.pitchLimit} min={45} max={89} step={1} suffix="°" onChange={set('pitchLimit')} />
      </SettingRow>
    </>
  );
}

const TARGET_PRESETS = [
  { value: '#f7f8f8', label: 'White' },
  { value: '#14181c', label: 'Black' },
  { value: '#18c5d8', label: 'Cyan' },
  { value: '#ff8a1f', label: 'Orange' },
  { value: '#e5302a', label: 'Red' },
];

function TargetPreview({ values }) {
  const { face, border } = targetPalette(values.color);
  const inner = (1 - values.borderThickness) * 100;
  return (
    <div className="flex h-24 w-24 items-center justify-center border border-rule" style={{ background: '#d3d8dc' }}>
      <div
        data-testid="target-preview"
        className="relative h-16 w-16 rounded-full"
        style={{
          opacity: values.opacity,
          background: `radial-gradient(circle closest-side, ${face} ${inner}%, ${border} ${inner + 0.8}%)`,
        }}
      >
        {values.centerMarker && (
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: border }} />
        )}
      </div>
    </div>
  );
}

function TargetSettings({ values, update, settings }) {
  const set = (key) => (value) => update('targets', key, value);
  const profile = runProfile(settings);
  return (
    <>
      <div className="flex items-end gap-5 pb-3">
        <TargetPreview values={values} />
        <p className="max-w-sm text-[13px] leading-snug text-ink-soft" data-testid="run-profile">
          {profile.standard
            ? 'Standard run. Sessions count towards personal bests.'
            : `Custom ${profile.reasons.join(' and ')}. Sessions still count towards training totals but can't set personal bests.`}
        </p>
      </div>
      <SettingRow label="Colour">
        <ColorField label="Target colour" value={values.color} presets={TARGET_PRESETS} onChange={set('color')} />
      </SettingRow>
      <SettingRow label="Size" hint="Multiplies every mode's target size. Affects personal bests. A paused session keeps its size until you restart it.">
        <SliderField label="Target size" value={values.size} min={0.5} max={2} step={0.05} decimals={2} suffix="×" onChange={set('size')} />
      </SettingRow>
      <SettingRow label="Spawn area" hint="Scales the region targets appear in, always staying above the floor. Affects personal bests. A paused session keeps its area until you restart it.">
        <SliderField label="Spawn area" value={values.spawnArea} min={0.5} max={1.5} step={0.05} decimals={2} suffix="×" onChange={set('spawnArea')} />
      </SettingRow>
      <SettingRow label="Opacity" hint="Affects personal bests.">
        <SliderField label="Target opacity" value={values.opacity} min={0.4} max={1} step={0.05} decimals={2} onChange={set('opacity')} />
      </SettingRow>
      <SettingRow label="Border thickness" hint="As a share of the target's radius.">
        <SliderField label="Border thickness" value={values.borderThickness} min={0.04} max={0.4} step={0.01} decimals={2} onChange={set('borderThickness')} />
      </SettingRow>
      <SettingRow label="Centre marker">
        <Toggle label="Centre marker" checked={values.centerMarker} onChange={set('centerMarker')} />
      </SettingRow>
      <SettingRow label="Hit effects" hint="Set to 0 to remove them completely. Hit detection is unaffected.">
        <SliderField label="Hit effects" value={values.hitEffects} min={0} max={1} step={0.05} decimals={2} onChange={set('hitEffects')} />
      </SettingRow>
      <SettingRow label="Scenario seed" hint="Enter any text to replay the same target sequence every run. Empty uses a new one each time.">
        <input
          type="text"
          aria-label="Scenario seed"
          data-testid="seed"
          className="field type-readout w-40 text-right text-base"
          maxLength={32}
          spellCheck={false}
          placeholder="Random"
          value={values.seed}
          onChange={(event) => set('seed')(event.target.value)}
        />
      </SettingRow>
    </>
  );
}

const PRESET_OPTIONS = [
  { value: 'performance', label: 'Performance' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

const FPS_CAPS = [60, 120, 144, 165, 240, 360, 0].map((value) => ({
  value,
  label: value === 0 ? 'Uncapped' : String(value),
}));

function GraphicsSettings({ values, update }) {
  const set = (key) => (value) => update('graphics', key, value);
  const store = settingsStore.getState();
  const custom = values.preset === 'custom';
  const themeOptions = Object.entries(THEMES).map(([value, theme]) => ({ value, label: theme.label }));

  return (
    <>
      <SettingRow label="Theme" hint={`${THEMES[values.theme].description} Themes never affect gameplay or scoring.`}>
        <Segmented label="Theme" value={values.theme} options={themeOptions} onChange={store.setTheme} />
      </SettingRow>
      <SettingRow label="Quality preset" hint={custom ? 'Custom: you have changed individual settings below.' : 'Sets everything below in one step. Ultra can fall below the refresh rate of a fast display, so use High or lower for competitive practice.'}>
        <Segmented label="Quality preset" value={values.preset} options={PRESET_OPTIONS} onChange={store.applyGraphicsPreset} />
      </SettingRow>
      <SettingRow label="Render scale" hint="Share of your display's full resolution. Lower is faster and softer.">
        <SliderField label="Render scale" value={values.renderScale} min={0.5} max={1} step={0.05} decimals={2} suffix="×" onChange={set('renderScale')} />
      </SettingRow>
      <SettingRow label="Anti-aliasing" hint="Smooths edges. Changing it briefly rebuilds the renderer.">
        <Toggle label="Anti-aliasing" checked={values.antialiasing} onChange={set('antialiasing')} />
      </SettingRow>
      <SettingRow label="Shadows" hint="Low draws target shadows only. Medium and High add the room's shadows.">
        <Segmented
          label="Shadows"
          value={values.shadows}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          onChange={set('shadows')}
        />
      </SettingRow>
      <SettingRow label="Ambient occlusion" hint="Full adds a screen-space pass, which costs frame time and input latency.">
        <Segmented
          label="Ambient occlusion"
          value={values.ambientOcclusion}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'baked', label: 'Baked' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={set('ambientOcclusion')}
        />
      </SettingRow>
      <SettingRow label="Floor reflections" hint="Draws the room a second time at half resolution.">
        <Toggle label="Floor reflections" checked={values.reflections === 'planar'} onChange={(on) => set('reflections')(on ? 'planar' : 'off')} />
      </SettingRow>
      <SettingRow label="Particles">
        <Segmented
          label="Particles"
          value={values.particles}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ]}
          onChange={set('particles')}
        />
      </SettingRow>
      <SettingRow label="Post-processing" hint="Adds a soft bloom on light sources, through extra full-screen passes that cost frame time.">
        <Toggle label="Post-processing" checked={values.postprocessing} onChange={set('postprocessing')} />
      </SettingRow>
      <SettingRow label="Frame rate cap" hint="Uncapped adds no limit of its own, but browsers still pace rendering to your display's refresh rate.">
        <Segmented label="Frame rate cap" value={values.fpsCap} options={FPS_CAPS} onChange={set('fpsCap')} />
      </SettingRow>
    </>
  );
}

function AudioSettings({ values, update }) {
  const set = (key) => (value) => update('audio', key, value);
  const volume = (label, key) => (
    <SettingRow label={label}>
      <SliderField label={label} value={Math.round(values[key] * 100)} min={0} max={100} step={1} suffix="%" onChange={(value) => set(key)(value / 100)} />
    </SettingRow>
  );
  return (
    <>
      {volume('Master volume', 'master')}
      {volume('Gunshot', 'gunshot')}
      {volume('Hit confirmation', 'hit')}
      {volume('Interface sounds', 'ui')}
      <SettingRow label="Room ambience" hint="A very quiet air-handling tone behind everything.">
        <Toggle label="Room ambience" checked={values.ambient} onChange={set('ambient')} />
      </SettingRow>
    </>
  );
}

function WeaponSettings({ values, update }) {
  const set = (key) => (value) => update('weapon', key, value);
  return (
    <>
      <SettingRow label="Show pistol">
        <Toggle label="Show pistol" checked={values.visible} onChange={set('visible')} />
      </SettingRow>
      <SettingRow label="Visual recoil" hint="Moves only the model. It can never change where you aim.">
        <Toggle label="Visual recoil" checked={values.recoil} onChange={set('recoil')} />
      </SettingRow>
      <SettingRow label="Animation intensity">
        <SliderField label="Animation intensity" value={values.animationIntensity} min={0} max={1.5} step={0.05} decimals={2} onChange={set('animationIntensity')} />
      </SettingRow>
      <SettingRow label="Position">
        <Segmented
          label="Pistol position"
          value={values.position}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'low', label: 'Low' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={set('position')}
        />
      </SettingRow>
      <SettingRow label="Idle movement" hint="A very slight drift of the model. Never affects aim.">
        <Toggle label="Idle movement" checked={values.idle} onChange={set('idle')} />
      </SettingRow>
    </>
  );
}

function InterfaceSettings({ values, update }) {
  const set = (key) => (value) => update('interface', key, value);
  const row = (label, key, hint) => (
    <SettingRow label={label} hint={hint}>
      <Toggle label={label} checked={values[key]} onChange={set(key)} />
    </SettingRow>
  );
  return (
    <>
      {row('Show FPS', 'showFps', 'Current, average and 1% low, over the last 1000 frames.')}
      {row('Show frame time', 'showFrameTime')}
      {row('Show timer', 'showTimer')}
      {row('Show score', 'showScore')}
      {row('Show accuracy', 'showAccuracy')}
      {row('Minimal HUD', 'minimalHud', 'Hides score and accuracy during play.')}
      {row('Hit marker', 'hitMarker')}
      {row('Skip countdown in endless modes', 'skipCountdown')}
    </>
  );
}

export function SettingsPanel() {
  const game = useGame();
  const root = useRef(null);
  const [category, setCategory] = useState('mouse');
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const resetCategory = useSettings((state) => state.resetCategory);
  const resetAll = useSettings((state) => state.resetAll);
  const fullscreen = useApp((state) => state.fullscreen);
  useEntrance(root);
  useEscape(useCallback(() => game.closeSettings(), [game]));

  const values = settings[category];
  const currentLabel = CATEGORIES.find((entry) => entry.id === category).label;

  return (
    <main ref={root} className="fixed inset-0 flex justify-end">
      <div
        data-fade
        className="grid h-full w-full max-w-[64rem] grid-cols-[13rem_minmax(0,1fr)] bg-paper"
      >
        <nav aria-label="Settings categories" className="flex flex-col border-r border-rule p-8">
          <button type="button" data-testid="settings-close" className="quiet-button self-start py-0 text-sm" onClick={() => game.closeSettings()}>
            Done
          </button>
          <h1 className="type-display mt-8 text-2xl">Settings</h1>
          <ul className="mt-6 flex flex-col gap-1">
            {CATEGORIES.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  data-testid={`settings-${entry.id}`}
                  aria-current={entry.id === category ? 'true' : undefined}
                  className={`relative w-full py-1 pl-3 text-left text-base ${entry.id === category ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'}`}
                  onClick={() => setCategory(entry.id)}
                >
                  {entry.id === category && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 bg-index" />}
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col items-start gap-2">
            <button type="button" className="text-sm text-ink-soft hover:text-ink" onClick={() => game.requestFullscreen()}>
              {fullscreen ? 'Exit fullscreen' : 'Go fullscreen'}
            </button>
            <ConfirmButton label="Reset all settings" confirmLabel="Click again to reset all" onConfirm={resetAll} />
          </div>
        </nav>

        <section className="scroll-area h-full overflow-y-auto px-8 pb-10 pt-8 lg:px-10" aria-label={`${currentLabel} settings`}>
          <div className="flex items-baseline justify-between pb-3">
            <h2 className="type-display text-3xl">{currentLabel}</h2>
            <ConfirmButton
              label={`Reset ${currentLabel.toLowerCase()}`}
              confirmLabel="Click again to reset"
              onConfirm={() => resetCategory(category)}
            />
          </div>
          {category === 'mouse' && <MouseSettings values={values} update={update} />}
          {category === 'camera' && <CameraSettings values={values} update={update} />}
          {category === 'crosshair' && <CrosshairEditor values={values} update={update} targetColor={settings.targets.color} />}
          {category === 'targets' && <TargetSettings values={values} update={update} settings={settings} />}
          {category === 'graphics' && <GraphicsSettings values={values} update={update} />}
          {category === 'audio' && <AudioSettings values={values} update={update} />}
          {category === 'weapon' && <WeaponSettings values={values} update={update} />}
          {category === 'interface' && <InterfaceSettings values={values} update={update} />}
        </section>
      </div>
    </main>
  );
}

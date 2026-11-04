import { Wordmark } from './Wordmark.jsx';

function Notice({ title, children }) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper px-6 py-10 sm:px-12 sm:py-16">
      <Wordmark />
      <h1 className="type-display mt-16 max-w-xl text-3xl sm:text-5xl">{title}</h1>
      <div className="mt-6 max-w-lg text-base text-ink-soft">{children}</div>
    </main>
  );
}

export function DesktopOnlyNotice() {
  return (
    <Notice title="Vernier needs a mouse">
      <p>
        It trains the fine movements of a mouse in first person, and touch aiming can't exercise
        those in the same way. Open this page on a desktop or laptop with a mouse to play.
      </p>
      <p className="mt-4">
        You'll get six training modes, an adjustable sensitivity and crosshair, and progress saved in
        your browser. No account or install is needed.
      </p>
    </Notice>
  );
}

export function GraphicsErrorNotice() {
  return (
    <Notice title="Vernier couldn't start its graphics">
      <p>
        This browser couldn't create a WebGL context. Turn on hardware acceleration in the browser's
        settings, update your graphics driver, then reload this page.
      </p>
    </Notice>
  );
}

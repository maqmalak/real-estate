import type { CSSProperties } from "react";
import "./industry-city.css";

/**
 * IndustryCity — ported 1:1 from src/pages/Website/industry-city, a static,
 * dependency-free CSS isometric "hologram city": 7 buildings covering
 * MicroMax's key industries (textile & garment, manufacturing, school,
 * hospital, hotel, distributor warehouse, import/export yard), animated
 * roads, drive-through traffic, a gantry crane and a conveyor belt. Every
 * element and coordinate below is that source's own markup — generated with
 * a script rather than transcribed by hand, so the geometry stays exact.
 * Only the outer wrapper (industry-city.css's .ic-scope) is new, replacing
 * that source's full-viewport <header>/.stage demo shell so this drops into
 * the hero panel in place of the old Three.js city. Hover, tap or keyboard-
 * focus a building for its tooltip — all pure CSS; unlike hero-city.ts's
 * canvas + raycaster, no JS is involved in the hover itself.
 */
export function IndustryCity() {
  return (
    <div className="ic-scope">
      <div className="world">
      <div className="ground">
        <div className="pulse" />
        <div className="pulse p2" />
      </div>
      <div className="flat road rx" style={{ "--x": 0, "--y": 8.1, "--w": 24, "--d": 1.5 } as CSSProperties} />
      <div className="flat road rx" style={{ "--x": 0, "--y": 17.1, "--w": 24, "--d": 1.5 } as CSSProperties} />
      <div className="flat road ry" style={{ "--x": 15.3, "--y": 0, "--w": 1.1, "--d": 8.1 } as CSSProperties} />
      <div className="flat road ry" style={{ "--x": 15.3, "--y": 9.6, "--w": 1.1, "--d": 7.5 } as CSSProperties} />
      <div className="flat pad" style={{ "--x": 0.8, "--y": 19, "--w": 22.6, "--d": 4.9 } as CSSProperties} />
      <div className="bld" tabIndex={0} role="group" aria-label="Textile and garment factory" style={{ "--dl": "0s", "--tagd": "0s" } as CSSProperties}>
        <div className="cb" style={{ "--x": 5.2, "--y": 2.2, "--z": 0, "--w": 0.45, "--d": 0.45, "--h": 3.2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb fl" style={{ "--x": 1.5, "--y": 3, "--z": 0, "--w": 4.2, "--d": 3.4, "--h": 1.5, "--f": 2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 1.5, "--y": 3.15, "--z": 1.5, "--w": 4.2, "--d": 0.7, "--h": 0.5 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 1.5, "--y": 4.2829999999999995, "--z": 1.5, "--w": 4.2, "--d": 0.7, "--h": 0.5 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 1.5, "--y": 5.416, "--z": 1.5, "--w": 4.2, "--d": 0.7, "--h": 0.5 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 6.0, "--y": 4.4, "--z": 0, "--w": 1.2, "--d": 1.2, "--h": 0.22, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="grp bob">
          <div className="cb so" style={{ "--x": 6.0, "--y": 4.4, "--z": 0.24, "--w": 1.2, "--d": 1.2, "--h": 0.22, "--c": "#34D399" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 6.0, "--y": 4.4, "--z": 0.48, "--w": 1.2, "--d": 1.2, "--h": 0.22, "--c": "#60A5FA" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 6.0, "--y": 4.4, "--z": 0.72, "--w": 1.2, "--d": 1.2, "--h": 0.22, "--c": "#FFD166" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 6.0, "--y": 4.4, "--z": 0.96, "--w": 1.2, "--d": 1.2, "--h": 0.22, "--c": "#A78BFA" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="cb so" style={{ "--x": 6.1, "--y": 6.0, "--z": 0.0, "--w": 1.0, "--d": 0.6, "--h": 0.22, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 6.1, "--y": 6.0, "--z": 0.24, "--w": 1.0, "--d": 0.6, "--h": 0.22, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 6.1, "--y": 6.0, "--z": 0.48, "--w": 1.0, "--d": 0.6, "--h": 0.22, "--c": "#A78BFA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="puff" style={{ "--x": 5.42, "--y": 2.42, "--z": 3.2, "--pd": "0s" } as CSSProperties}>
          <b />
          <b />
          <b />
        </div>
        <div className="tag" style={{ "--x": 3.6, "--y": 4.7, "--z": 3.8 } as CSSProperties}>
          <span>
            Textile &amp; garment
            <small>
              Weaving hall, sawtooth roof and fabric bolts.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="Manufacturing plant" style={{ "--dl": "0.15s", "--tagd": "2s" } as CSSProperties}>
        <div className="cb fl" style={{ "--x": 9.5, "--y": 2.5, "--z": 0, "--w": 3, "--d": 4, "--h": 2.4, "--f": 3 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 10.0, "--y": 3.0, "--z": 2.4, "--w": 0.45, "--d": 0.45, "--h": 1.6 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 11.2, "--y": 3.0, "--z": 2.4, "--w": 0.45, "--d": 0.45, "--h": 1.2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb fl" style={{ "--x": 12.5, "--y": 3.5, "--z": 0, "--w": 2.3, "--d": 3, "--h": 1.3, "--f": 2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="door" style={{ "left": "26%", "width": "48%", "height": "70%" } as CSSProperties} />
          </i>
          <i className="e" />
        </div>
        <div className="flat belt" style={{ "--x": 9.5, "--y": 6.75, "--w": 5.3, "--d": 0.5 } as CSSProperties} />
        <div className="veh belt-item" style={{ "--x": 9.5, "--y": 6.82, "--w": 0.35, "--d": 0.35, "animationDelay": "0.0s" } as CSSProperties}>
          <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.03, "--w": 0.35, "--d": 0.35, "--h": 0.35, "--c": "#FF8A3D" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="veh belt-item" style={{ "--x": 9.5, "--y": 6.82, "--w": 0.35, "--d": 0.35, "animationDelay": "-1.2s" } as CSSProperties}>
          <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.03, "--w": 0.35, "--d": 0.35, "--h": 0.35, "--c": "#34D399" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="veh belt-item" style={{ "--x": 9.5, "--y": 6.82, "--w": 0.35, "--d": 0.35, "animationDelay": "-2.4s" } as CSSProperties}>
          <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.03, "--w": 0.35, "--d": 0.35, "--h": 0.35, "--c": "#FF8A3D" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="veh belt-item" style={{ "--x": 9.5, "--y": 6.82, "--w": 0.35, "--d": 0.35, "animationDelay": "-3.5999999999999996s" } as CSSProperties}>
          <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.03, "--w": 0.35, "--d": 0.35, "--h": 0.35, "--c": "#34D399" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="veh belt-item" style={{ "--x": 9.5, "--y": 6.82, "--w": 0.35, "--d": 0.35, "animationDelay": "-4.8s" } as CSSProperties}>
          <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.03, "--w": 0.35, "--d": 0.35, "--h": 0.35, "--c": "#FF8A3D" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="puff" style={{ "--x": 10.22, "--y": 3.22, "--z": 4.0, "--pd": "0s" } as CSSProperties}>
          <b />
          <b />
          <b />
        </div>
        <div className="puff" style={{ "--x": 11.42, "--y": 3.22, "--z": 3.6, "--pd": "-1.6s" } as CSSProperties}>
          <b />
          <b />
          <b />
        </div>
        <div className="tag" style={{ "--x": 11.3, "--y": 4.5, "--z": 4.6 } as CSSProperties}>
          <span>
            Manufacturing
            <small>
              Production hall, chimneys and a conveyor.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="School" style={{ "--dl": "0.3s", "--tagd": "4s" } as CSSProperties}>
        <div className="cb fl" style={{ "--x": 17.5, "--y": 2.5, "--z": 0, "--w": 5, "--d": 1.8, "--h": 1.6, "--f": 2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 19.5, "--y": 2.8, "--z": 1.6, "--w": 1, "--d": 1, "--h": 1.2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="clock">
              <b />
            </span>
          </i>
          <i className="e" />
        </div>
        <div className="cb fl" style={{ "--x": 17.5, "--y": 4.3, "--z": 0, "--w": 1.8, "--d": 2.4, "--h": 1.6, "--f": 2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="door" style={{ "left": "30%", "width": "40%", "height": "55%" } as CSSProperties} />
          </i>
          <i className="e" />
        </div>
        <div className="flat lawn" style={{ "--x": 19.6, "--y": 4.6, "--w": 2.8, "--d": 2.1 } as CSSProperties} />
        <div className="cb so" style={{ "--x": 22.1, "--y": 6.3, "--z": 0, "--w": 0.06, "--d": 0.06, "--h": 3, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="flag" style={{ "--x": 22.16, "--y": 6.33 } as CSSProperties}>
          <b />
        </div>
        {/* Moved from the source's (20, 3.3, 3.4) — that put the tag's screen
            projection right under the "Your module" plug hex on the far
            right of the ring, so the two labels sat on top of each other.
            Lower and further left on the building's own footprint keeps it
            clear. */}
        <div className="tag" style={{ "--x": 17.6, "--y": 6, "--z": 1.6 } as CSSProperties}>
          <span>
            School
            <small>
              Classroom wings, a clock tower and the flag.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="Hospital" style={{ "--dl": "0.45s", "--tagd": "6s" } as CSSProperties}>
        <div className="cb fl" style={{ "--x": 1.5, "--y": 11.5, "--z": 0, "--w": 4, "--d": 3.8, "--h": 2.8, "--f": 4 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="door" style={{ "left": "40%", "width": "20%", "height": "28%" } as CSSProperties} />
          </i>
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 2.3, "--y": 12.2, "--z": 2.8, "--w": 2.4, "--d": 2.2, "--h": 0.8 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t">
            <span className="cross">
              <b />
              <b />
            </span>
          </i>
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 2.8, "--y": 15.3, "--z": 0.9, "--w": 1.4, "--d": 0.5, "--h": 0.12 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 1.6, "--y": 15.5, "--z": 0.05, "--w": 1.1, "--d": 0.55, "--h": 0.45, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s">
            <span className="stripe" />
          </i>
          <i className="e" />
        </div>
        <div className="cb so siren" style={{ "--x": 2.0, "--y": 15.65, "--z": 0.5, "--w": 0.2, "--d": 0.25, "--h": 0.1, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="tag" style={{ "--x": 3.5, "--y": 13.3, "--z": 4.2 } as CSSProperties}>
          <span>
            Hospital
            <small>
              Wards, emergency care and an ambulance.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="Hotel" style={{ "--dl": "0.6s", "--tagd": "8s" } as CSSProperties}>
        <div className="cb fl" style={{ "--x": 9, "--y": 11.5, "--z": 0, "--w": 4.5, "--d": 4, "--h": 1, "--f": 1 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="door" style={{ "left": "40%", "width": "20%", "height": "70%" } as CSSProperties} />
          </i>
          <i className="e" />
        </div>
        <div className="cb fl" style={{ "--x": 9.8, "--y": 12.2, "--z": 1, "--w": 2.8, "--d": 2.6, "--h": 5.5, "--f": 9 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="wins " style={{ "--rw": 9, "--cl": 4 } as CSSProperties}>
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
            </span>
          </i>
          <i className="e">
            <span className="wins side" style={{ "--rw": 4, "--cl": 9 } as CSSProperties}>
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
              <b />
            </span>
          </i>
        </div>
        <div className="cb so" style={{ "--x": 10.3, "--y": 12.7, "--z": 6.5, "--w": 1.8, "--d": 1.6, "--h": 0.35, "--c": "#A78BFA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 9.6, "--y": 15.5, "--z": 0, "--w": 0.9, "--d": 0.4, "--h": 0.5, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="tag" style={{ "--x": 11.2, "--y": 13.5, "--z": 7.3 } as CSSProperties}>
          <span>
            Hotel
            <small>
              Guest tower above a lobby podium.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="Distributor warehouse" style={{ "--dl": "0.75s", "--tagd": "10s" } as CSSProperties}>
        <div className="cb fl" style={{ "--x": 16.5, "--y": 11.5, "--z": 0, "--w": 6, "--d": 3.4, "--h": 1.7, "--f": 1 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s">
            <span className="door" style={{ "left": "11.7%", "width": "18.3%", "height": "59%" } as CSSProperties} />
            <span className="door" style={{ "left": "43.3%", "width": "18.3%", "height": "59%" } as CSSProperties} />
            <span className="door" style={{ "left": "75%", "width": "18.3%", "height": "59%" } as CSSProperties} />
          </i>
          <i className="e" />
        </div>
        <div className="cb" style={{ "--x": 16.5, "--y": 12.7, "--z": 1.7, "--w": 6, "--d": 1, "--h": 0.3 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 17.3, "--y": 15.3, "--z": 0, "--w": 0.6, "--d": 0.6, "--h": 0.5, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 17.3, "--y": 15.3, "--z": 0.5, "--w": 0.6, "--d": 0.6, "--h": 0.4, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="grp fork">
          <div className="cb so" style={{ "--x": 18.2, "--y": 15.35, "--z": 0, "--w": 0.7, "--d": 0.5, "--h": 0.45, "--c": "#FFD166" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 18.9, "--y": 15.4, "--z": 0, "--w": 0.08, "--d": 0.4, "--h": 0.9, "--c": "#7C8CAA" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 19.0, "--y": 15.35, "--z": 0.25, "--w": 0.45, "--d": 0.5, "--h": 0.45, "--c": "#FF8A3D" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="cb so" style={{ "--x": 21.1, "--y": 15.3, "--z": 0, "--w": 0.6, "--d": 0.6, "--h": 0.5, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 21.1, "--y": 15.3, "--z": 0.5, "--w": 0.6, "--d": 0.6, "--h": 0.4, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="tag" style={{ "--x": 19.5, "--y": 13.2, "--z": 2.5 } as CSSProperties}>
          <span>
            Distributor warehouse
            <small>
              Loading docks, pallets and a forklift.
            </small>
          </span>
        </div>
      </div>
      <div className="bld" tabIndex={0} role="group" aria-label="Import and export container yard" style={{ "--dl": "0.9s", "--tagd": "12s" } as CSSProperties}>
        <div className="cb so rib" style={{ "--x": 1.3, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 1.3, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 1.3, "--y": 19.5, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 3.5, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 3.5, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 5.7, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 5.7, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 5.7, "--y": 19.5, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 1.3, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 1.3, "--y": 21.7, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 3.5, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 3.5, "--y": 21.7, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 3.5, "--y": 21.7, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 5.7, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 14.2, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 14.2, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 16.4, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 16.4, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 16.4, "--y": 19.5, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 18.6, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 20.8, "--y": 19.5, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 20.8, "--y": 19.5, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 14.2, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 14.2, "--y": 21.7, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 14.2, "--y": 21.7, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 16.4, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 18.6, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 18.6, "--y": 21.7, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 20.8, "--y": 21.7, "--z": 0.0, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 20.8, "--y": 21.7, "--z": 0.78, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 20.8, "--y": 21.7, "--z": 1.56, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="grp crane">
          <div className="cb" style={{ "--x": 10.3, "--y": 19.25, "--z": 0, "--w": 0.25, "--d": 0.25, "--h": 3.4, "--e": "255,209,102" } as CSSProperties}>
            <i className="n" />
            <i className="w" />
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="grp trolley">
            <div className="cb so" style={{ "--x": 10.4, "--y": 20.88, "--z": 1.85, "--w": 0.04, "--d": 0.04, "--h": 1.55, "--c": "#E6F0FF" } as CSSProperties}>
              <i className="t" />
              <i className="s" />
              <i className="e" />
            </div>
            <div className="grp hoist">
              <div className="cb so rib" style={{ "--x": 9.42, "--y": 20.45, "--z": 1.6, "--w": 2.0, "--d": 0.9, "--h": 0.75, "--c": "#FF8A3D" } as CSSProperties}>
                <i className="t" />
                <i className="s" />
                <i className="e" />
              </div>
            </div>
          </div>
          <div className="cb" style={{ "--x": 10.3, "--y": 19.25, "--z": 3.4, "--w": 0.25, "--d": 4.2, "--h": 0.3, "--e": "255,209,102" } as CSSProperties}>
            <i className="n" />
            <i className="w" />
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb" style={{ "--x": 10.3, "--y": 23.2, "--z": 0, "--w": 0.25, "--d": 0.25, "--h": 3.4, "--e": "255,209,102" } as CSSProperties}>
            <i className="n" />
            <i className="w" />
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
        </div>
        <div className="tag" style={{ "--x": 11.5, "--y": 21.3, "--z": 4.3 } as CSSProperties}>
          <span>
            Import &amp; export yard
            <small>
              Container stacks, a gantry crane and trucks.
            </small>
          </span>
        </div>
      </div>
      {/*
        Construction site — new, not ported from the source (which had no
        8th building). Sits in the one open plot in the grid, between the
        hospital and the hotel. A tower crane rotates its whole jib assembly
        (arm, counter-jib, cab, hook) as one rigid group around the mast top,
        via a per-instance transform-origin — the same rigid-group technique
        the source uses for the yard's gantry crane, just rotateZ instead of
        translateX, since a tower crane swings rather than slides. The hook
        reuses the source's own .hoist bob for its up/down motion.
      */}
      <div className="bld" tabIndex={0} role="group" aria-label="Real estate construction site" style={{ "--dl": "1.05s", "--tagd": "14s" } as CSSProperties}>
        <div className="cb rib" style={{ "--x": 6.5, "--y": 13.15, "--z": 0, "--w": 0.3, "--d": 0.3, "--h": 6.5 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb fl" style={{ "--x": 5.6, "--y": 12.3, "--z": 0, "--w": 2, "--d": 2, "--h": 2.6, "--f": 2 } as CSSProperties}>
          <i className="n" />
          <i className="w" />
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 5.5, "--y": 14.6, "--z": 0, "--w": 0.8, "--d": 0.5, "--h": 0.4, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 6.5, "--y": 14.6, "--z": 0, "--w": 0.8, "--d": 0.5, "--h": 0.4, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 7.5, "--y": 14.7, "--z": 0, "--w": 0.6, "--d": 0.5, "--h": 0.35, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="grp jib" style={{ transformOrigin: "calc(6.65 * var(--u)) calc(13.3 * var(--u))" } as CSSProperties}>
          <div className="cb" style={{ "--x": 6.65, "--y": 13.15, "--z": 6.5, "--w": 2.6, "--d": 0.3, "--h": 0.15, "--e": "255,209,102" } as CSSProperties}>
            <i className="n" />
            <i className="w" />
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb" style={{ "--x": 5.15, "--y": 13.15, "--z": 6.5, "--w": 1.5, "--d": 0.3, "--h": 0.15, "--e": "255,209,102" } as CSSProperties}>
            <i className="n" />
            <i className="w" />
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 5.0, "--y": 13.0, "--z": 6.35, "--w": 0.5, "--d": 0.55, "--h": 0.5, "--c": "#7C8CAA" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so" style={{ "--x": 6.3, "--y": 12.9, "--z": 6.15, "--w": 0.55, "--d": 0.55, "--h": 0.5, "--c": "#E6F0FF" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="cb so siren" style={{ "--x": 6.58, "--y": 13.28, "--z": 6.65, "--w": 0.14, "--d": 0.14, "--h": 0.14, "--c": "#FB4F6F" } as CSSProperties}>
            <i className="t" />
            <i className="s" />
            <i className="e" />
          </div>
          <div className="grp hoist">
            <div className="cb so" style={{ "--x": 8.28, "--y": 13.28, "--z": 1.2, "--w": 0.04, "--d": 0.04, "--h": 5.3, "--c": "#E6F0FF" } as CSSProperties}>
              <i className="t" />
              <i className="s" />
              <i className="e" />
            </div>
            <div className="cb so rib" style={{ "--x": 8.2, "--y": 13.2, "--z": 0.9, "--w": 0.5, "--d": 0.5, "--h": 0.3, "--c": "#FF8A3D" } as CSSProperties}>
              <i className="t" />
              <i className="s" />
              <i className="e" />
            </div>
          </div>
        </div>
        <div className="tag" style={{ "--x": 6.65, "--y": 13.3, "--z": 7.4 } as CSSProperties}>
          <span>
            Real estate &amp; construction
            <small>
              Tower crane raising a new build.
            </small>
          </span>
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 0.2, "--y": 8.2, "--w": 2.35, "--d": 0.6, "--dist": 21.4, "animationDuration": "14s" } as CSSProperties}>
        <div className="cb so rib" style={{ "--x": 0, "--y": 0, "--z": 0.15, "--w": 1.7, "--d": 0.6, "--h": 0.6, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 1.8, "--y": 0, "--z": 0.1, "--w": 0.55, "--d": 0.6, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 0.2, "--y": 8.2, "--w": 2.35, "--d": 0.6, "--dist": 21.4, "animationDuration": "14s", "animationDelay": "-7s" } as CSSProperties}>
        <div className="cb so rib" style={{ "--x": 0, "--y": 0, "--z": 0.15, "--w": 1.7, "--d": 0.6, "--h": 0.6, "--c": "#60A5FA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 1.8, "--y": 0, "--z": 0.1, "--w": 0.55, "--d": 0.6, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 22.9, "--y": 8.95, "--w": 0.9, "--d": 0.5, "--dist": -22.7, "animationDuration": "10s", "animationDelay": "-2s" } as CSSProperties}>
        <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.05, "--w": 0.9, "--d": 0.5, "--h": 0.28, "--c": "#2DD4BF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 0.2, "--y": 0.05, "--z": 0.33, "--w": 0.5, "--d": 0.4, "--h": 0.2, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 22.9, "--y": 8.95, "--w": 0.9, "--d": 0.5, "--dist": -22.7, "animationDuration": "10s", "animationDelay": "-7s" } as CSSProperties}>
        <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.05, "--w": 0.9, "--d": 0.5, "--h": 0.28, "--c": "#A78BFA" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 0.2, "--y": 0.05, "--z": 0.33, "--w": 0.5, "--d": 0.4, "--h": 0.2, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 0.2, "--y": 17.2, "--w": 2.35, "--d": 0.6, "--dist": 21.4, "animationDuration": "17s", "animationDelay": "-3s" } as CSSProperties}>
        <div className="cb so rib" style={{ "--x": 0, "--y": 0, "--z": 0.15, "--w": 1.7, "--d": 0.6, "--h": 0.6, "--c": "#34D399" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 1.8, "--y": 0, "--z": 0.1, "--w": 0.55, "--d": 0.6, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 0.2, "--y": 17.2, "--w": 2.35, "--d": 0.6, "--dist": 21.4, "animationDuration": "17s", "animationDelay": "-11.5s" } as CSSProperties}>
        <div className="cb so rib" style={{ "--x": 0, "--y": 0, "--z": 0.15, "--w": 1.7, "--d": 0.6, "--h": 0.6, "--c": "#FB4F6F" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 1.8, "--y": 0, "--z": 0.1, "--w": 0.55, "--d": 0.6, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-x" style={{ "--x": 21.3, "--y": 17.9, "--w": 2.35, "--d": 0.6, "--dist": -21.1, "animationDuration": "15s", "animationDelay": "-5s" } as CSSProperties}>
        <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.1, "--w": 0.55, "--d": 0.6, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so rib" style={{ "--x": 0.65, "--y": 0, "--z": 0.15, "--w": 1.7, "--d": 0.6, "--h": 0.6, "--c": "#FFD166" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>
      <div className="veh drive-y" style={{ "--x": 15.55, "--y": 0.2, "--w": 0.6, "--d": 2.35, "--dist": 14.4, "animationDuration": "12s", "animationDelay": "-4s" } as CSSProperties}>
        <div className="cb so" style={{ "--x": 0, "--y": 0, "--z": 0.15, "--w": 0.6, "--d": 1.7, "--h": 0.6, "--c": "#FF8A3D" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
        <div className="cb so" style={{ "--x": 0, "--y": 1.8, "--z": 0.1, "--w": 0.6, "--d": 0.55, "--h": 0.55, "--c": "#E6F0FF" } as CSSProperties}>
          <i className="t" />
          <i className="s" />
          <i className="e" />
        </div>
      </div>

      </div>
    </div>
  );
}

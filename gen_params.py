import argparse
import json
from pathlib import Path
from typing import Tuple

import matplotlib.pyplot as plt
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Solve damped oscillator ODE and emit params.js plus plot.png."
    )
    parser.add_argument("--m", type=float, required=True, help="Mass (kg)")
    parser.add_argument("--c", type=float, required=True, help="Damping coefficient (N*s/m)")
    parser.add_argument("--k", type=float, required=True, help="Stiffness (N/m)")
    parser.add_argument("--y0", type=float, required=True, help="Initial displacement (m)")
    parser.add_argument("--v0", type=float, required=True, help="Initial velocity (m/s)")
    parser.add_argument("--dt", type=float, required=True, help="Integration timestep (s)")
    parser.add_argument("--scale", type=float, required=True, help="Render scale factor")
    parser.add_argument(
        "--plot-file",
        type=str,
        default="plot.png",
        help="Output filename for the generated plot (default: plot.png)",
    )
    return parser.parse_args()


def heun_step(
    m: float,
    c: float,
    k: float,
    x: float,
    v: float,
    dt: float,
) -> Tuple[float, float]:
    """Advance one integration step with Heun's method (improved Euler)."""

    def accel(px: float, pv: float) -> float:
        return -(c / m) * pv - (k / m) * px

    a1 = accel(x, v)
    x_predict = x + dt * v
    v_predict = v + dt * a1
    a2 = accel(x_predict, v_predict)
    x_next = x + dt * 0.5 * (v + v_predict)
    v_next = v + dt * 0.5 * (a1 + a2)
    return x_next, v_next


def integrate(
    m: float,
    c: float,
    k: float,
    x0: float,
    v0: float,
    dt: float,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if dt <= 0:
        raise ValueError("dt must be positive.")
    
    # Calculate natural frequency and damping ratio
    omega_n = np.sqrt(k / m)
    zeta = c / (2 * np.sqrt(m * k))
    # Calculate duration based on time to reach 1% of initial amplitude
    duration = -np.log(0.01) / (zeta * omega_n)

    steps = int(np.ceil(duration / dt))
    times = np.linspace(0.0, steps * dt, steps + 1)
    xs = np.zeros(steps + 1, dtype=float)
    vs = np.zeros(steps + 1, dtype=float)
    xs[0] = x0
    vs[0] = v0

    for i in range(steps):
        xs[i + 1], vs[i + 1] = heun_step(m, c, k, xs[i], vs[i], dt)

    return times, xs, vs


def plot_solution(times: np.ndarray, xs: np.ndarray, vs: np.ndarray, output: Path) -> None:
    plt.figure(figsize=(9, 5))
    plt.plot(times, xs, label="x(t) displacement [m]")
    plt.plot(times, vs, label="v(t) velocity [m/s]")
    plt.xlabel("Time [s]")
    plt.grid(True, which="both", linestyle="--", linewidth=0.5)
    plt.legend()
    plt.title("Damped Oscillator Response")
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()


def write_params_js(params: dict, output: Path) -> None:
    payload = "window.DAMP_PARAMS = " + json.dumps(params, ensure_ascii=False) + ";"
    output.write_text(payload, encoding="utf-8")


def main() -> None:
    args = parse_args()
    params_path = Path("params.js")
    plot_path = Path(args.plot_file)
    if not plot_path.parent.exists():
        plot_path.parent.mkdir(parents=True, exist_ok=True)

    times, xs, vs = integrate(
        args.m,
        args.c,
        args.k,
        args.y0,
        args.v0,
        args.dt,
    )

    plot_solution(times, xs, vs, plot_path)

    # Calculate natural frequency and damping ratio for duration
    omega_n = np.sqrt(args.k / args.m)
    zeta = args.c / (2 * np.sqrt(args.m * args.k))
    duration = -np.log(0.01) / (zeta * omega_n)

    params = {
        "m": args.m,
        "c": args.c,
        "k": args.k,
        "y0": args.y0,
        "v0": args.v0,
        "dt": args.dt,
        "scale": args.scale,
        "duration": duration  # Include calculated duration
    }
    write_params_js(params, params_path)

    print(f"Wrote {params_path} and {plot_path}")


if __name__ == "__main__":
    main()

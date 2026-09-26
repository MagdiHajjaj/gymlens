"""Create reproducible SYNTHETIC side-view landmark recordings (not human validation data)."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "public" / "exercises"
root.mkdir(parents=True, exist_ok=True)


def joint_angle(ax, ay, bx, by, cx, cy):
    ux, uy = ax - bx, ay - by
    vx, vy = cx - bx, cy - by
    d = math.hypot(ux, uy) * math.hypot(vx, vy)
    if d < 1e-8:
        return float("nan")
    return math.degrees(math.acos(max(-1.0, min(1.0, (ux * vx + uy * vy) / d))))


def make_points():
    return [dict(x=.5, y=.2, z=0, visibility=0) for _ in range(33)]


def setpoint(points, i, x, y, vis=.99):
    points[i] = dict(x=x, y=y, z=0, visibility=vis)
    if i >= 11 and i % 2:
        points[i + 1] = dict(x=x + .008, y=y, z=.03, visibility=.95)


# ---- Romanian deadlift: two-segment chain, facing +x ----
DL_KNEE = (.48, .68)
DL_ANKLE = (.48, .90)
DL_THIGH = .20
DL_TORSO = .32


def deadlift_pose(t, lean_extra=0.0):
    """t in [0,1]: 0 = standing tall, 1 = full hinge. lean_extra (degrees) pitches
    the torso further at the same hip trajectory -- the rounding-fault rep."""
    alpha = math.radians(t * 20.0)
    beta = math.radians(8.0 + t * 57.0 + lean_extra)
    hx = DL_KNEE[0] - DL_THIGH * math.sin(alpha)
    hy = DL_KNEE[1] - DL_THIGH * math.cos(alpha)
    sx = hx + DL_TORSO * math.sin(beta)
    sy = hy - DL_TORSO * math.cos(beta)
    return (sx, sy), (hx, hy)


def deadlift_hip(t):
    (sx, sy), (hx, hy) = deadlift_pose(t)
    return joint_angle(sx, sy, hx, hy, *DL_KNEE)


def solve_deadlift(target_hip):
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if deadlift_hip(mid) > target_hip:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ---- Lunge: front leg on the left (odd) side, facing -x ----
LU_ANKLE = (.35, .90)
LU_THIGH = .22
LU_SHIN = .22


def lunge_full(psi_deg, tilt_deg):
    """psi = thigh angle from vertical (solved per rep), tilt = shin tilt."""
    phi = math.radians(tilt_deg)
    psi = math.radians(psi_deg)
    kx = LU_ANKLE[0] + LU_SHIN * math.sin(phi)
    ky = LU_ANKLE[1] - LU_SHIN * math.cos(phi)
    hx = kx + LU_THIGH * math.sin(psi)
    hy = ky - LU_THIGH * math.cos(psi)
    return (hx, hy), (kx, ky)


def solve_lunge_psi(target_knee, tilt_deg):
    lo, hi = -10.0, 100.0
    for _ in range(50):
        mid = (lo + hi) / 2
        (hx, hy), (kx, ky) = lunge_full(mid, tilt_deg)
        if joint_angle(hx, hy, kx, ky, *LU_ANKLE) > target_knee:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ---- Overhead press: upper arm vertical, forearm rotates down to rack ----
PR_SHOULDER = (.52, .45)
PR_ELBOW = (.52, .27)
PR_HIP = (.52, .65)


def press_wrist(rad_deg):
    r = math.radians(rad_deg)
    return (PR_ELBOW[0] + .19 * math.sin(r), PR_ELBOW[1] + .19 * math.cos(r))


for exercise in ["squat", "curl", "pushup", "deadlift", "lunge", "press"]:
    frames = []

    def frame(angle, lean=12):
        points = make_points()

        def sp(i, x, y):
            setpoint(points, i, x, y)

        radians = None
        if exercise == "squat":
            radians = math.radians(angle)
            knee = (.48, .65)
            hip = (knee[0] + .24 * math.sin(radians), knee[1] + .24 * math.cos(radians))
            shoulder = (hip[0] - .27 * math.sin(math.radians(lean)), hip[1] - .27 * math.cos(math.radians(lean)))
            sp(23, *hip); sp(25, *knee); sp(27, .48, .89)
            sp(11, *shoulder); sp(13, shoulder[0] - .13, shoulder[1] + .04); sp(15, shoulder[0] - .22, shoulder[1] - .02)
            sp(0, shoulder[0], shoulder[1] - .07)
        elif exercise == "curl":
            radians = math.radians(angle)
            sp(11, .52, .27); sp(13, .52, .47)
            sp(15, .52 - .19 * math.sin(radians), .47 - .19 * math.cos(radians))
            sp(23, .52, .57); sp(25, .52, .73); sp(27, .52, .91); sp(0, .52, .18)
        elif exercise == "pushup":
            radians = math.radians(angle)
            sp(11, .27, .4); sp(13, .27, .59)
            sp(15, .27 - .18 * math.sin(radians), .59 - .18 * math.cos(radians))
            sp(23, .53, .44); sp(25, .7, .467); sp(27, .87, .494); sp(0, .19, .385)
        elif exercise == "deadlift":
            t, lean_extra = angle  # (hinge amount, extra torso pitch in degrees)
            (sx, sy), (hx, hy) = deadlift_pose(t, lean_extra)
            sp(27, *DL_ANKLE); sp(25, *DL_KNEE)
            sp(23, hx, hy); sp(11, sx, sy)
            sp(13, sx + .10, sy + .05); sp(15, sx + .12, sy + .20)
            sp(0, sx, sy - .07)
        elif exercise == "lunge":
            psi, tilt, hx, hy, kx, ky = angle  # angle is a precomputed pose tuple
            sp(27, *LU_ANKLE); sp(25, kx, ky); sp(23, hx, hy)
            sx, sy = hx - .30 * math.sin(math.radians(8)), hy - .30 * math.cos(math.radians(8))
            sp(11, sx, sy)
            sp(13, sx - .02, sy + .18); sp(15, sx - .02, sy + .32)
            sp(0, sx, sy - .07)
            # back leg: visual only (even indices, analyzer tracks the left side)
            setpoint(points, 24, hx + .12, hy + .02)
            setpoint(points, 26, .60, .72)
            setpoint(points, 28, .68, .90)
        else:  # press
            rad, arch = angle  # (elbow angle target, hip x-shift for the arch fault)
            wx, wy = press_wrist(rad)
            sp(11, *PR_SHOULDER); sp(13, *PR_ELBOW); sp(15, wx, wy)
            sp(23, PR_HIP[0] + arch, PR_HIP[1])
            sp(25, .52, .80); sp(27, .52, .95)
            sp(0, .52, .38)
        sp(31, points[27]["x"] - .04, points[27]["y"] + .015)
        return dict(timestampMs=len(frames) * 50, landmarks=points, aspectRatio=1)

    def cycle_values():
        """Yield (down_param, hold_param, up_param, faulty) per cycle."""
        if exercise in ("squat", "curl", "pushup"):
            depths = [90, 125, 90] if exercise == "squat" else [45, 105, 45] if exercise == "curl" else [80, 115, 80]
            leans = [12, 12, 55]
            for cycle, depth in enumerate(depths):
                yield (depth, leans[cycle])
        elif exercise == "deadlift":
            t95 = solve_deadlift(95)
            t130 = solve_deadlift(130)
            for tb, le_max in [(t95, 0.0), (t130, 0.0), (t95, 30.0)]:
                yield (tb, le_max)
        elif exercise == "lunge":
            psi95 = solve_lunge_psi(95, 8.0)
            psi130 = solve_lunge_psi(130, 8.0)
            psi95f = solve_lunge_psi(95, 25.0)
            for psi_b, tilt in [(psi95, 8.0), (psi130, 8.0), (psi95f, 25.0)]:
                (hx, hy), (kx, ky) = lunge_full(psi_b, tilt)
                yield (psi_b, tilt, hx, hy, kx, ky)
        else:  # press
            for cycle, (depth, arch) in enumerate([(85, 0.0), (110, 0.0), (85, 0.13)]):
                yield (depth, arch)

    if exercise == "deadlift":
        for _ in range(24):
            frames.append(frame((0.0, 0.0)))
        for tb, le_max in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((tb * amount, le_max * amount)))
            for _ in range(8):
                frames.append(frame((tb, le_max)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((tb * (1 - amount), le_max * (1 - amount))))
            for _ in range(16):
                frames.append(frame((0.0, 0.0)))
    elif exercise == "lunge":
        psi172 = solve_lunge_psi(172, 8.0)
        (shx, shy), (skx, sky) = lunge_full(psi172, 8.0)
        stand = (psi172, 8.0, shx, shy, skx, sky)
        for _ in range(24):
            frames.append(frame(stand))
        for pose in cycle_values():
            psi_b, tilt, bhx, bhy, bkx, bky = pose
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                psi = psi172 + (psi_b - psi172) * amount
                (hx, hy), (kx, ky) = lunge_full(psi, tilt)
                frames.append(frame((psi, tilt, hx, hy, kx, ky)))
            (hx, hy), (kx, ky) = lunge_full(psi_b, tilt)
            for _ in range(8):
                frames.append(frame((psi_b, tilt, hx, hy, kx, ky)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                psi = psi_b + (psi172 - psi_b) * amount
                (hx, hy), (kx, ky) = lunge_full(psi, tilt)
                frames.append(frame((psi, tilt, hx, hy, kx, ky)))
            for _ in range(16):
                frames.append(frame(stand))
    elif exercise == "press":
        for _ in range(24):
            frames.append(frame((175, 0.0)))
        for depth, arch in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((175 - (175 - depth) * amount, arch)))
            for _ in range(8):
                frames.append(frame((depth, arch)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((depth + (175 - depth) * amount, arch)))
            for _ in range(16):
                frames.append(frame((175, 0.0)))
    else:
        for _ in range(24):
            frames.append(frame(175))
        for depth, lean in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame(175 - (175 - depth) * amount, lean))
            for _ in range(8):
                frames.append(frame(depth, lean))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame(depth + (175 - depth) * amount, lean))
            for _ in range(16):
                frames.append(frame(175))
    (root / f"{exercise}.json").write_text(json.dumps(frames, separators=(",", ":")))
print("Wrote six synthetic landmark replay fixtures.")

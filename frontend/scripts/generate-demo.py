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


# ---- Glute bridge: lying side view, hips travel vertically ----
# t in [0,1]: 0 = hips on ground, 1 = full bridge. Shoulder stays planted;
# the hip angle runs ~111 (bottom) to ~180 (top).
GB_S = (.38, .80)
GB_A = (.62, .88)
GB_HIP_BOT = (.55, .78)
GB_HIP_TOP = (.52, .60)
GB_KNEE_BOT = (.60, .58)
GB_KNEE_TOP = (.640, .428)


def gb_pose(t):
    hx = GB_HIP_BOT[0] + (GB_HIP_TOP[0] - GB_HIP_BOT[0]) * t
    hy = GB_HIP_BOT[1] + (GB_HIP_TOP[1] - GB_HIP_BOT[1]) * t
    kx = GB_KNEE_BOT[0] + (GB_KNEE_TOP[0] - GB_KNEE_BOT[0]) * t
    ky = GB_KNEE_BOT[1] + (GB_KNEE_TOP[1] - GB_KNEE_BOT[1]) * t
    return (hx, hy), (kx, ky)


def gb_hip(t, sx=GB_S[0], sy=GB_S[1]):
    (hx, hy), (kx, ky) = gb_pose(t)
    return joint_angle(sx, sy, hx, hy, kx, ky)


def solve_gb(target_hip):
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if gb_hip(mid) > target_hip:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


# ---- Bent-over row: hinged torso, arms hang, elbow flexes to pull ----
RW_H = (.50, .62)
RW_S = (.712, .408)
RW_E = (.722, .60)
RW_S_UP = (.56, .34)  # torso-rising fault: shoulder drifts toward vertical


def row_wrist(elbow_deg, ex=RW_E[0], ey=RW_E[1]):
    r = math.radians(180.0 - elbow_deg)
    return (ex + .19 * math.sin(r), ey + .19 * math.cos(r))


# ---- Dips & pull-up: two-segment arm, elbow solved by circle intersection ----
def solve_elbow(sx, sy, wx, wy, L, forward):
    """Elbow of a two-segment arm (both segments length L). forward picks the
    intersection on the +x side (pull-up) or -x side (dips)."""
    dx, dy = wx - sx, wy - sy
    d = math.hypot(dx, dy)
    if d < 1e-9:
        d = 1e-9
    if d > 2 * L:  # overextended: elbow lies on the segment
        return (sx + dx / d * L, sy + dy / d * L)
    a = d / 2.0
    h = math.sqrt(max(L * L - a * a, 0.0))
    mx, my = sx + dx / 2.0, sy + dy / 2.0
    ox, oy = -dy / d * h, dx / d * h
    e1 = (mx + ox, my + oy)
    e2 = (mx - ox, my - oy)
    return e1 if (e1[0] > e2[0]) == forward else e2


DP_W = (.60, .58)
DP_L = .18


def dips_elbow_deg(sy):
    ex, ey = solve_elbow(.56, sy, *DP_W, DP_L, False)
    return joint_angle(.56, sy, ex, ey, *DP_W)


def solve_dips_sy(target_elbow):
    lo, hi = 0.20, 0.36  # shoulder height: top (extended) -> bottom (flexed)
    for _ in range(40):
        mid = (lo + hi) / 2
        if dips_elbow_deg(mid) > target_elbow:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


PU_W = (.50, .12)
PU_L = .12


def pullup_elbow_deg(sy):
    ex, ey = solve_elbow(.50, sy, *PU_W, PU_L, True)
    return joint_angle(.50, sy, ex, ey, *PU_W)


def solve_pullup_sy(target_elbow):
    lo, hi = 0.22, 0.38  # shoulder height: top (flexed) -> dead hang (extended)
    for _ in range(40):
        mid = (lo + hi) / 2
        if pullup_elbow_deg(mid) > target_elbow:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


for exercise in ["squat", "curl", "pushup", "deadlift", "lunge", "press",
                 "glute_bridge", "row", "dips", "pullup"]:
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
        elif exercise == "press":
            rad, arch = angle  # (elbow angle target, hip x-shift for the arch fault)
            wx, wy = press_wrist(rad)
            sp(11, *PR_SHOULDER); sp(13, *PR_ELBOW); sp(15, wx, wy)
            sp(23, PR_HIP[0] + arch, PR_HIP[1])
            sp(25, .52, .80); sp(27, .52, .95)
            sp(0, .52, .38)
        elif exercise == "glute_bridge":
            t, lift = angle  # (bridge amount, shoulder-lift amount for the arch fault)
            (hx, hy), (kx, ky) = gb_pose(t)
            sy = GB_S[1] - 0.35 * lift
            sp(11, GB_S[0], sy); sp(23, hx, hy); sp(25, kx, ky); sp(27, *GB_A)
            sp(0, GB_S[0], sy - .07)
        elif exercise == "row":
            elbow, rise = angle  # (elbow target, torso-rise amount)
            dx = (RW_S_UP[0] - RW_S[0]) * rise
            dy = (RW_S_UP[1] - RW_S[1]) * rise
            wx, wy = row_wrist(elbow)
            sp(11, RW_S[0] + dx, RW_S[1] + dy)
            sp(13, RW_E[0] + dx, RW_E[1] + dy)
            sp(15, wx + dx, wy + dy)
            sp(23, *RW_H)
            sp(25, .48, .78); sp(27, .50, .95)
            sp(0, RW_S[0] + dx, RW_S[1] + dy - .07)
        elif exercise == "dips":
            sy, lean = angle  # (shoulder height, hip x-shift for the lean fault)
            ex, ey = solve_elbow(.56, sy, *DP_W, DP_L, False)
            sp(11, .56, sy); sp(13, ex, ey); sp(15, *DP_W)
            sp(23, .59 + lean, sy + .22)
            sp(25, .69 + lean, sy + .36); sp(27, .75 + lean, sy + .54)
            sp(0, .56, sy - .07)
        elif exercise == "pullup":
            sy, swing = angle  # (shoulder height, hip x-shift for the swing fault)
            ex, ey = solve_elbow(.50, sy, *PU_W, PU_L, True)
            sp(11, .50, sy); sp(13, ex, ey); sp(15, *PU_W)
            sp(23, .51 + swing, sy + .26)
            sp(25, .53 + swing, sy + .40); sp(27, .50 + swing, sy + .56)
            sp(0, .50, sy - .09)
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
        elif exercise == "press":
            for cycle, (depth, arch) in enumerate([(85, 0.0), (110, 0.0), (85, 0.13)]):
                yield (depth, arch)
        elif exercise == "glute_bridge":
            t111 = solve_gb(111)
            t133 = solve_gb(133)
            for tb, lmax in [(t111, 0.0), (t133, 0.0), (t111, 1.0)]:
                yield (tb, lmax)
        elif exercise == "row":
            for elbow_b, rmax in [(65, 0.0), (110, 0.0), (65, 1.0)]:
                yield (elbow_b, rmax)
        elif exercise == "dips":
            s80 = solve_dips_sy(80)
            s107 = solve_dips_sy(107)
            for syb, lmax in [(s80, 0.0), (s107, 0.0), (s80, 0.15)]:
                yield (syb, lmax)
        elif exercise == "pullup":
            s60 = solve_pullup_sy(60)
            s95 = solve_pullup_sy(95)
            for syb, smax in [(s60, 0.0), (s95, 0.0), (s60, 0.15)]:
                yield (syb, smax)

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
    elif exercise == "glute_bridge":
        # The arch fault lifts the shoulders off the ground (lift 0->1) through
        # the second half of the descent and the bottom hold, then sets them
        # back down for the lift. While lifted, the torso inclination drops
        # below the fault threshold during the eccentric phase; the clean
        # ascent keeps the hip trajectory monotonic so the rep still counts.
        def gb_lift_down(j):
            if j < 16:
                return 0.0
            if j < 24:
                return (j - 15) / 8.0
            return 1.0

        def gb_lift_up(j):
            if j < 8:
                return 1.0 - (j + 1) / 8.0
            return 0.0

        for _ in range(24):
            frames.append(frame((1.0, 0.0)))
        for tb, lmax in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                t = 1.0 - (1.0 - tb) * amount
                frames.append(frame((t, lmax * gb_lift_down(j))))
            for _ in range(8):
                frames.append(frame((tb, lmax)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                t = tb + (1.0 - tb) * amount
                frames.append(frame((t, lmax * gb_lift_up(j))))
            for _ in range(16):
                frames.append(frame((1.0, 0.0)))
    elif exercise == "row":
        for _ in range(24):
            frames.append(frame((170, 0.0)))
        for elbow_b, rmax in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((170 - (170 - elbow_b) * amount, rmax * amount)))
            for _ in range(8):
                frames.append(frame((elbow_b, rmax)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((elbow_b + (170 - elbow_b) * amount, rmax * (1 - amount))))
            for _ in range(16):
                frames.append(frame((170, 0.0)))
    elif exercise == "dips":
        stop = 0.224  # top support: elbow ~169, verified above
        for _ in range(24):
            frames.append(frame((stop, 0.0)))
        for syb, lmax in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((stop + (syb - stop) * amount, lmax * amount)))
            for _ in range(8):
                frames.append(frame((syb, lmax)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((syb + (stop - syb) * amount, lmax * (1 - amount))))
            for _ in range(16):
                frames.append(frame((stop, 0.0)))
    elif exercise == "pullup":
        shang = 0.36  # dead hang: elbow 180, verified above
        for _ in range(24):
            frames.append(frame((shang, 0.0)))
        for syb, smax in cycle_values():
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((shang + (syb - shang) * amount, smax * amount)))
            for _ in range(8):
                frames.append(frame((syb, smax)))
            for j in range(32):
                amount = (1 - math.cos(math.pi * (j + 1) / 32)) / 2
                frames.append(frame((syb + (shang - syb) * amount, smax * (1 - amount))))
            for _ in range(16):
                frames.append(frame((shang, 0.0)))
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
print("Wrote ten synthetic landmark replay fixtures.")

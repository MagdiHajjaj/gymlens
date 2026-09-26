"""Create reproducible SYNTHETIC side-view landmark recordings (not human validation data)."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "public" / "exercises"
root.mkdir(parents=True, exist_ok=True)
for exercise in ["squat", "curl", "pushup"]:
    frames = []
    def frame(angle, lean=12):
        points = [dict(x=.5, y=.2, z=0, visibility=0) for _ in range(33)]
        def setpoint(i, x, y):
            points[i] = dict(x=x, y=y, z=0, visibility=.99)
            if i >= 11 and i % 2:
                points[i+1] = dict(x=x+.008, y=y, z=.03, visibility=.95)
        radians = math.radians(angle)
        if exercise == "squat":
            knee = (.48, .65)
            hip = (knee[0]+.24*math.sin(radians), knee[1]+.24*math.cos(radians))
            shoulder = (hip[0]-.27*math.sin(math.radians(lean)), hip[1]-.27*math.cos(math.radians(lean)))
            setpoint(23, *hip); setpoint(25, *knee); setpoint(27, .48, .89)
            setpoint(11, *shoulder); setpoint(13, shoulder[0]-.13, shoulder[1]+.04); setpoint(15, shoulder[0]-.22, shoulder[1]-.02)
            setpoint(0, shoulder[0], shoulder[1]-.07)
        elif exercise == "curl":
            setpoint(11, .52, .27); setpoint(13, .52, .47)
            setpoint(15, .52-.19*math.sin(radians), .47-.19*math.cos(radians))
            setpoint(23, .52, .57); setpoint(25, .52, .73); setpoint(27, .52, .91); setpoint(0, .52, .18)
        else:
            setpoint(11, .27, .4); setpoint(13, .27, .59)
            setpoint(15, .27-.18*math.sin(radians), .59-.18*math.cos(radians))
            setpoint(23, .53, .44); setpoint(25, .7, .467); setpoint(27, .87, .494); setpoint(0, .19, .385)
        setpoint(31, points[27]["x"]-.04, points[27]["y"]+.015)
        return dict(timestampMs=len(frames)*50, landmarks=points, aspectRatio=1)
    for _ in range(24): frames.append(frame(175))
    depths = [90, 125, 90] if exercise == "squat" else [45, 105, 45] if exercise == "curl" else [80, 115, 80]
    for cycle, depth in enumerate(depths):
        for j in range(32):
            amount = (1-math.cos(math.pi*(j+1)/32))/2
            frames.append(frame(175-(175-depth)*amount, 12+43*amount if cycle == 2 else 12))
        for _ in range(8): frames.append(frame(depth, 55 if cycle == 2 else 12))
        for j in range(32):
            amount = (1-math.cos(math.pi*(j+1)/32))/2
            frames.append(frame(depth+(175-depth)*amount, 55-43*amount if cycle == 2 else 12))
        for _ in range(16): frames.append(frame(175))
    (root / f"{exercise}.json").write_text(json.dumps(frames, separators=(",", ":")))
print("Wrote three synthetic landmark replay fixtures.")

import numpy as np

from eclipse_detector import get_satellite_states, ts


# ==========================================
# Earth radius
# ==========================================
EARTH_RADIUS = 6378.137


# ==========================================
# Get satellite states
# ==========================================
t = ts.now()

states = get_satellite_states(t)


# ==========================================
# Select two satellites
# ==========================================
sat_a = states[0]
sat_b = states[1]


# ==========================================
# Position vectors
# ==========================================
A = np.array([
    sat_a["x"],
    sat_a["y"],
    sat_a["z"]
])

B = np.array([
    sat_b["x"],
    sat_b["y"],
    sat_b["z"]
])


# ==========================================
# Vector from A to B
# ==========================================
AB = B - A


# ==========================================
# Projection parameter
# ==========================================
t_projection = -np.dot(A, AB) / np.dot(AB, AB)

# Keep projection inside line segment
t_projection = np.clip(
    t_projection,
    0,
    1
)


# ==========================================
# Closest point on line segment
# ==========================================
closest_point = A + t_projection * AB


# ==========================================
# Minimum distance from Earth center
# ==========================================
minimum_distance = np.linalg.norm(
    closest_point
)


# ==========================================
# LOS check
# ==========================================
has_los = minimum_distance >= EARTH_RADIUS


# ==========================================
# Display
# ==========================================
distance = np.linalg.norm(A - B)

print("Satellite A:", sat_a["id"])
print("Satellite B:", sat_b["id"])

print(f"\nSatellite distance: {distance:.2f} km")

print(
    f"Minimum distance of link from Earth center: "
    f"{minimum_distance:.2f} km"
)

print(
    f"Earth radius: {EARTH_RADIUS:.2f} km"
)

if has_los:
    print("\nLOS: ✅ AVAILABLE")
else:
    print("\nLOS: ❌ BLOCKED BY EARTH")
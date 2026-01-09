# Affinity Logic Reference (Extracted from `fishEncounterSim_WithRadiation.ipynb`)

Use this document as a reference for implementing or validating affinity calculations in the new `precompute` system.

## 1. Water Temperature Model (Linear Gradient)

The notebook simplifies water temperature as a linear gradient from surface to bottom.

### Formula
```python
# T(z) = SurfaceTemp - Slope * z
temperature_slope = (temperatureSurface - temperatureBottom) / (maxZ - 1)
temperature_data = temperatureSurface - temperature_slope * lake.coords['z']
```

*   **Inputs**:
    *   `temperatureSurface`: Manually set (e.g., 25°C).
    *   `temperatureBottom`: Manually set (e.g., 10°C).
    *   `maxZ`: Maximum depth of the lake.
*   **Assumption**: Temperature decreases linearly with depth.

## 2. Temperature Affinity (Gaussian)

Calculates how well the temperature at a specific voxel matches the fish's preferred temperature.

### Formula
```python
# Affinity = exp( - (T - T_fav)^2 / (2 * sigma^2) )
mu = environment_df.loc[fish, FAV_TEMPERATURE]        # T_fav
sigma = environment_df.loc[fish, COEF_TEMPERATURE]    # Temperature Sensitivity (Ratio)

lakeRedearTempAff = np.exp(-np.power(lake['temperature'] - mu, 2.) / (2 * np.power(sigma, 2.)))
```

*   **Key Parameter**: `2 * sigma^2` in the denominator.
    *   In the new system (`data_formula.md`), this corresponds to `TEMP_TOLERANCE_WIDTH * (temp_affected_ratio)^2`.
    *   **Mapping**: `TEMP_TOLERANCE_WIDTH` roughly equals `2.0` in the old notebook's logic, assuming `sigma` corresponds directly to `temp_affected_ratio`.

## 3. Structure (Material) Affinity (Lookup Table)

Uses a direct mapping from the Voxel's Material ID to an affinity score for the specific fish.

### Logic
```python
# 1. Get Affinity Map for the specific fish
redear_material_affinity_map = material_df.loc[fish_name].to_dict()
# {Material.WATER: 0.5, Material.GRASS: 1.0, ...}

# 2. Vectorize Lookup
redear_mat_aff_np = np.vectorize(redear_material_affinity_map.get)

# 3. Apply to Voxel Grid
lake_redear_affinity = redear_mat_aff_np(lake['material'].values)
```

*   **Implementation Note**: The new system uses a "Bitmask + Max Broadcast" approach, which is semantically equivalent to "Lookup + Max" if a voxel can contain multiple materials.

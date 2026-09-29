# Punggol WeRide Robobus — exterior CAD study

## Files

- `Punggol_WeRide_Robobus_v1.f3d`: native Fusion model with editable sketches, extrusions, fillets, materials and named bodies.
- `Punggol_WeRide_Robobus_v1.step`: exchange geometry.
- `Punggol_WeRide_Robobus_v1.png`: Fusion viewport preview.
- `model_report.json`: geometry and feature-health check from the build.
- `Robobus/Robobus.py`: native Fusion build script, run through Scripts and Add-Ins in an empty design.

## Dimensional basis

All dimensions below are millimetres. X runs from front to rear, Y across the vehicle, and Z upwards. Ground is Z=0.

| Reference dimension | Value | Status |
|---|---:|---|
| Nominal length | 5500 | Published Robobus brochure |
| Nominal width | 2050 | Published Robobus brochure |
| Nominal height | 2650 | Provisional; whether sensors are included is unverified |
| Wheelbase | 3800 | Published Robobus brochure |
| Front axle X | 850 | Estimated front overhang |
| Rear axle X | 4650 | Front axle plus published wheelbase |
| Wheel radius | 360 | Photo estimate |

Reference parameters are stored in the document for inspection; they are not a complete driving parameter system. Individual sketches and feature dimensions can be edited in the Fusion timeline. Changing one reference parameter alone does not rebuild all related geometry.

## Scope

This is an exterior visual study based on the supplied front three-quarter photograph, not an OEM engineering model. The glazing is represented as opaque dark exterior panels over a solid body envelope. There is no engineered passenger compartment, chassis, suspension, working door mechanism or accessibility ramp. Wheel, door, panel, lamp, badge and sensor geometry are estimates. Sensor mounts and exterior trim extend beyond the nominal body envelope. The circular badge is a placeholder rather than an exact logo reproduction.

## Sources checked on 15 September 2026

- [Grab: Ai.R launch announcement](https://www.grab.com/sg/press/others/grab-in-partnership-with-weride-unveils-ai-r-autonomous-service-for-punggol/) identifies the eight-passenger Robobus used in Punggol.
- [WeRide-branded Robobus brochure, third-party-hosted copy](https://www.scribd.com/document/1012424277/Robobus%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D-%E4%B8%AD%E6%96%87V1) lists 5500 × 2050 × 2650 and a 3800 wheelbase. Exact Singapore vehicle conformity remains unverified.
- [Yutong Xiaoyu 2.0 listing](https://www.yutong.com.cn/zhuanti/conference2023/) lists 5500 × 2050 × 2700 for a related configuration. The 50 mm height discrepancy is unresolved.

Native modelling uses Autodesk's [extrusion API](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/ExtrudeFeatureSample_Sample.htm) and [fillet API](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/FilletFeatureSample_Sample.htm).

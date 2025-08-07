#!/usr/bin/env python
"""
Test the recursion bug - when _cdot receives a CompoundModel as input
"""
import numpy as np
from astropy.modeling import models as m
from astropy.modeling.separable import separability_matrix, _separable

# The real bug appears to be in how _cdot handles CompoundModels
# When processing nested CompoundModels, _cdot may receive a CompoundModel
# as left or right, but tries to call .separable on it

print("=== Testing the real bug ===")
print("When we have deeply nested CompoundModels, _cdot might receive")
print("a CompoundModel instead of a simple Model or array")
print()

# Create a case that triggers this
cm1 = m.Linear1D(1) & m.Linear1D(2)
print(f"cm1: {cm1}")
print(f"cm1 separability: {_separable(cm1)}")
print()

# Now create a nested case
mapping = m.Mapping([0, 1])
nested = mapping | cm1
print(f"nested: {nested}")

# The issue is that when _separable processes 'nested', it calls:
# _cdot(mapping, cm1)
# And _cdot tries to process cm1 using _coord_matrix
# But _coord_matrix checks model.separable which doesn't exist for CompoundModels

# The fix should be to have _cdot call _separable recursively on CompoundModels
# rather than trying to use _coord_matrix directly

print("\nThe bug is in _cdot function at line 264-275 of separable.py")
print("It should check if input is a CompoundModel and call _separable on it")
print("rather than calling _coord_matrix which expects simple Models")
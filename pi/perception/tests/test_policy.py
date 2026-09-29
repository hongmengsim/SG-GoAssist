import unittest

from perception.policy import DEFAULT_POLICY, SAFE, UNSAFE, Policy


class PolicyTests(unittest.TestCase):
    def test_an_unlisted_class_is_unsafe(self) -> None:
        self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict("chair", 0.99))

    def test_an_unknown_or_empty_class_is_unsafe(self) -> None:
        for name in ("", "   ", None, 7):
            with self.subTest(name=name):
                self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict(name, 0.99))

    def test_only_leaf_and_plastic_bag_are_safe_by_default(self) -> None:
        self.assertEqual(frozenset({"leaf", "plastic_bag"}), DEFAULT_POLICY.safe_classes)
        self.assertEqual(SAFE, DEFAULT_POLICY.verdict("leaf", 0.95))
        self.assertEqual(SAFE, DEFAULT_POLICY.verdict("plastic_bag", 0.95))
        self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict("bag_or_box", 0.99))

    def test_a_safe_class_needs_high_confidence(self) -> None:
        self.assertEqual(0.92, DEFAULT_POLICY.min_safe_confidence)
        self.assertEqual(SAFE, DEFAULT_POLICY.verdict("leaf", 0.92))
        self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict("leaf", 0.9199))

    def test_an_invalid_confidence_is_unsafe(self) -> None:
        for confidence in (None, "0.99", float("nan"), True, -1.0, 1.5):
            with self.subTest(confidence=confidence):
                self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict("leaf", confidence))

    def test_class_names_are_matched_ignoring_case_and_spaces(self) -> None:
        self.assertEqual(SAFE, DEFAULT_POLICY.verdict(" Leaf ", 0.99))
        self.assertEqual(UNSAFE, DEFAULT_POLICY.verdict(" PERSON ", 0.99))

    def test_people_and_mobility_devices_can_never_be_safe(self) -> None:
        names = ["person", "wheelchair", "mobility_scooter", "rollator_walker", "walker",
                 "stroller", "bicycle", "crutches", "walking_cane", "white_cane", "animal"]
        policy = Policy(safe_classes=frozenset(names + ["leaf"]))
        for name in names:
            with self.subTest(name=name):
                self.assertEqual(UNSAFE, policy.verdict(name, 1.0))

    def test_a_custom_safe_list_is_honoured(self) -> None:
        policy = Policy(safe_classes=frozenset({"bottle"}), min_safe_confidence=0.5)
        self.assertEqual(SAFE, policy.verdict("bottle", 0.6))
        self.assertEqual(UNSAFE, policy.verdict("leaf", 0.99))


if __name__ == "__main__":
    unittest.main()

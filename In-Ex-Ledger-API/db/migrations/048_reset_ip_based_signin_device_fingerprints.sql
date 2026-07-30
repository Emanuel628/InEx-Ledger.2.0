-- Reset sign-in device fingerprints after removing IP address from the stable fingerprint.
-- Existing rows were created with IP-based hashes, so keeping them would cause one
-- false "new sign-in" alert after deployment for every existing user/device.
-- The next successful sign-in is treated as the baseline recognized device without
-- sending a new-device alert because the login flow skips alerts when no device
-- history exists for the user.
DELETE FROM recognized_signin_devices;

# SpendFlow Decisions

- Expo SDK 54 with Expo Router is used for now to match the requested target SDK while keeping the file-based screen layout.
- Supabase uses `@supabase/supabase-js` plus AsyncStorage session persistence. The deprecated `@supabase/react-native` package is not used.
- Charts use an Expo-compatible SVG rendering path with `react-native-svg`; `victory-native` is installed as the maintained charting foundation for future richer chart primitives.
- `write-excel-file` is used instead of `xlsx` because `xlsx` currently reports high-severity advisories with no fixed release.
- Offline writes are queued in AsyncStorage under `spendflow_offline_queue` and processed in order once connectivity returns.

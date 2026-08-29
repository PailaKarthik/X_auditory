# Implementation notes

## Important model boundary

The supplied notebook uses the Hugging Face AST audio-classification model:
`MIT/ast-finetuned-audioset-10-10-0.4593` with PyTorch, `librosa`, and `AutoFeatureExtractor`/`AutoModelForAudioClassification`.

Node/Express should not attempt to reimplement this PyTorch model. The project therefore uses:

1. Express as the public API.
2. A small Python inference service that loads the model once and exposes `POST /predict`.
3. MongoDB for event configuration, modes, detection history, STT history, and device state.

This is still a local backend implementation. For the judge explanation, the same boundary can later be deployed as a cloud model endpoint; the app/API contract does not need to change.

## Real-time decision path

Settings are synchronized/configured ahead of time. The audio detection request never waits for a database permission check from a remote cloud for every event. Express checks the active mode from MongoDB for this prototype; a future X device would receive a synchronized local copy of that configuration and make the decision locally for low latency.

## Direction

The supplied notebook only performs audio classification. It does not provide spatial localization. Therefore the current no-hardware demo accepts a simulated direction value in the multipart request and returns it to the app. A future X implementation can populate the same field from microphone-array direction-of-arrival processing plus IMU orientation.

## STT

The mobile app's Conversation Mode uses `SpeechRecognition` when running through Expo Web. The Web Speech API is browser-based and has limited availability across environments, so the app reports a clear unsupported state on native builds rather than pretending browser APIs exist there.

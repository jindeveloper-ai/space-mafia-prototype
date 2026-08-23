# Design references and licenses

This project implements its interface independently in HTML and CSS. No Figma assets, icons, illustrations, or components are bundled.

## Unicode emoji

- The private-chat picker inserts Unicode emoji characters as text and lets each operating system render them with its installed emoji font. No third-party emoji image, font, or CDN asset is bundled. Unicode standards and data are made freely available under the [Unicode Terms of Use](https://www.unicode.org/copyright.html) and the [Unicode License](https://www.unicode.org/license.txt).

## Pixabay audio

The following tracks are bundled as in-product background music. Their Pixabay pages identify them as free for use under the Pixabay Content License.

- Lobby: **Detectives Among Us Dramedy** by **Pastichio_Piano_Music** — [track page](https://pixabay.com/music/comedy-detectives-among-us-dramedy-289364/) (`assets/audio/lobby-detectives-among-us.mp3`)
- Game: **Sneaky Mystery - Film Noir Spy Music Loop** by **Sonican** — [track page](https://pixabay.com/music/mystery-sneaky-mystery-film-noir-spy-music-loop-442493/) (`assets/audio/game-sneaky-film-noir.mp3`)

The following sound effects alternate between call connections as quiet line ambience in private voice calls and mafia voice mode:

- **Fan Noise to Fall Asleep** by **u_sqbdol9i82** — [sound-effect page](https://pixabay.com/sound-effects/film-special-effects-fan-noise-to-fall-asleep-573497/) (`assets/audio/call-fan-noise-573497.mp3`)
- **air vent 1** by **patchytherat (Freesound)** — [sound-effect page](https://pixabay.com/sound-effects/technology-air-vent-1-27167/) (`assets/audio/call-air-vent-27167.mp3`)

The call copies are mono, low-bitrate in-product adaptations. The fan recording is shortened to 60 seconds and the 53-second air-vent recording is preserved at its source duration; both loop quietly during a connected call and are not offered as standalone downloads.

The official [Pixabay Content License summary](https://pixabay.com/service/license-summary/) permits free use, use without attribution, and modification, subject to its prohibited uses. In particular, unmodified content must not be sold or distributed on a standalone basis. The full Pixabay license remains legally controlling.

## Project-created images

The following mascot and crew portraits were created specifically for this project and are not copied from the Figma references or third-party character assets:

- `assets/images/mafia-astronaut-v2.png`
- `assets/images/mina.png`
- `assets/images/juno.png`
- `assets/images/noel.png`

The contextual archive/game illustrations, localized habitat maps, animated reaction stickers, and animated welcome mascot under these paths were also created specifically for MARS.NET:

- `assets/images/archive/`
- `assets/images/game/`
- `assets/images/stickers/`
- `assets/images/mafia-astronaut-v2.gif`

The short archive videos in `assets/video/archive/` were created locally from the project-created archive illustrations. They contain no third-party footage or audio. The GIF stickers and welcome animation were likewise assembled locally from project-created source artwork. No runtime image-generation service or third-party media CDN is used by these features.

The welcome-screen television scene was generated offline for this project through the verified `jindeveloper-ai` Replicate account. It is bundled locally and does not call Replicate at runtime:

- `assets/images/welcome-tv-mafia-loop-source-v1.webp` — generated with `openai/gpt-image-2`
- `assets/images/welcome-tv-mafia-scene-v1.png` — project crop of the generated source
- `assets/video/welcome-tv-mafia-loop-v1.mp4` — generated with `bytedance/seedance-2.5` from the same project frame, without generated audio or a watermark

## MIT-licensed code reference

- **8bit gaming room /w Nintendo & GTA** by **r4ms3s** — [public CodePen](https://codepen.io/r4ms3s/pen/vJMJmK). CodePen states that public Pens are [MIT licensed](https://blog.codepen.io/documentation/licensing/). MARS.NET references its retro CRT silhouette and scanline concept, then implements a smaller responsive cabinet independently in project HTML and CSS; no Nintendo, GTA, Pac-Man, poster, console, or other third-party artwork is copied.

## CC BY 4.0 references

- **Chat AI Bot Complete Designs | ChatGPT** by StarrySia — [Figma Community source](https://www.figma.com/community/file/1393434471248075066/chat-ai-bot-complete-designschatgpt), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Referenced for mobile chat-room hierarchy, avatar-led conversation, light/dark parity, and a persistent composer. Adapted into an original multi-character Mafia chat layout.
- **AI CHAT** by Narges Poorsharafi and Kiarash — [Figma Community source](https://www.figma.com/community/file/1375401610142001200/ai-chat), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Reviewed as a contrast case for dark-theme hierarchy and compact mobile composition; its gradient/glow AI aesthetic was intentionally not copied.

## Visual reference only

- **Octovoice (Community)** — [shared Figma design](https://www.figma.com/design/1dZRGEK2KxQWyZeoZz3Bmp/Octovoice--Community-?node-id=1-74). The shared editor view does not display an authoritative resource license. It was used only to observe general mobile voice/chat flow. No layer, asset, component, or visual expression was copied.

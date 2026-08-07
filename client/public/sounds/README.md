# Sounds

Drop your audio files here. The app silently skips missing files.

| Filename            | Plays when…                      |
| ------------------- | -------------------------------- |
| `victory.mp3`       | Focus session ends (celebration) |
| `break-start.mp3`   | Break phase begins               |
| `session-start.mp3` | A new focus round starts         |
| `click.wav`         | UI button press                  |

Filenames are mapped explicitly in `src/lib/sounds.ts` (`FILES`), so formats
can be mixed — swap any of these for your own and update that map.

`click.wav` is a synthesized 35 ms tick, not a recording; replace it freely.

Free sources: freesound.org, pixabay.com/music, opengameart.org

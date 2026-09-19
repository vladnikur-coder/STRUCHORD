#!/usr/bin/env node
/* B-87 — структурированные поля исполнителя и названия. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
let n=0; function ok(v,m){ if(!v) throw new Error('ПРОВАЛ: '+m); console.log('OK:',m); n++; }
ok(src.includes('id="songArtist"') && src.includes('id="songTitle"'), 'редактор имеет два независимых поля');
ok(src.includes('placeholder="Исполнитель"'), 'есть лаконичный плейсхолдер исполнителя');
ok(src.includes('placeholder="Название"'), 'есть лаконичный плейсхолдер названия');
ok(src.includes('song-identity-separator'), 'между полями есть дефис');
ok(src.includes('id="tlSongArtist"') && src.includes('id="tlSongTitle"'), 'лента имеет ту же пару полей');
ok(src.includes('metadata: currentSongMetadata()'), 'сохранение пишет объект metadata');
ok(!/name:\s*DOM\.songTitle/.test(src), 'старое name больше не источник истины сохранения');
ok(src.includes('artist: asSafeText(rawSong.metadata.artist'), 'artist проходит санитайзер');
ok(src.includes('title: asSafeText(rawSong.metadata.title'), 'title проходит санитайзер');
ok(src.includes('function songDisplayName'), 'составная подпись имеет единую функцию');
ok(src.includes('`${m.artist} - ${m.title}`'), 'подпись использует формат Исполнитель - Название');
ok(src.includes("|| 'Без названия'"), 'пустые метаданные получают безопасную подпись');
ok(src.includes('function splitLegacySongName'), 'старый name разбирается отдельно');
ok(src.includes('(?:—|-)'), 'разбор понимает дефис и тире');
ok(src.includes('function requestLegacyMetadata'), 'старой песне показывается диалог миграции');
ok(src.includes('id="legacyArtist"') && src.includes('id="legacyTitle"'), 'в диалоге два поля');
ok(src.includes('__metadataResolved'), 'диалог не зацикливает повторную загрузку');
ok(src.includes("metadata, __metadataResolved: true"), 'ответ диалога передаётся в загрузчик');
ok(src.includes('const SONG_SCHEMA_VERSION = 4'), 'схема поднята до v4');
ok(src.includes('migrateV3toV4'), 'цепочка миграций остаётся полной');
ok(src.includes('songLibraryName(s) === name'), 'совпадения библиотеки учитывают составную подпись');
ok(src.includes("songDisplayName(songData.metadata).replace"), 'имя экспортного файла строится из metadata');
ok(src.includes('DOM.songArtist.value = loadedMeta.artist'), 'загрузка ставит исполнителя в DOM');
ok(src.includes('DOM.songTitle.value = loadedMeta.title'), 'загрузка ставит название в DOM');
ok(src.includes('artist.value = DOM.songArtist.value'), 'редактор синхронизируется с лентой');
ok(src.includes('DOM.songArtist.value = artist.value'), 'лента синхронизируется с редактором');
ok(src.includes('@media (max-width: 38rem)'), 'пара адаптируется на узком экране');
ok(src.includes('function fitSongArtistField'), 'дефис следует за умной шириной исполнителя');
ok(src.includes('id="capsuleStyleSelect"'), 'выбор стиля доступен в настройках');
ok(src.includes("const CAPSULE_STYLES = new Set(['matte', 'outline', 'joined', 'floating', 'accent', 'glass'])"), 'доступны шесть вариантов капсул');
ok(src.includes("struchord-capsule-style"), 'выбор стиля сохраняется локально');
console.log(`\nALL OK — ${n} проверок B-87.`);

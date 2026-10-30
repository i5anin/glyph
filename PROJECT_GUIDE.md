# Путеводитель: glyph

Автономная инструкция: достаточно этой папки, исходников и перечисленных защищённых копий. История чатов и центральный каталог не требуются.

[Восстановление](RECOVERY.md) · [Карта файлов и зависимостей](PROJECT_MAP.json)

## Назначение

По [package.json](package.json): Architecture as glyphs — text DSL into a live animated graph (Upload Labs aesthetic)

Обнаруженные языки: TypeScript, Vue SFC.

## Порядок чтения

1. Локальные AGENTS.md / CLAUDE.md и документы ниже.
2. Манифесты: версии среды, зависимости, команды.
3. Кандидаты точек входа; фактический запуск проверить по манифесту.
4. PROJECT_MAP.json: imports_local от источника к импортируемому файлу; входящие рёбра — потребители модуля.
5. RECOVERY.md: независимые данные, восстановление среды, запуск и критерии приёмки.

- [README.md](README.md)

## Манифесты

- [package.json](package.json)

## Кандидаты точек входа

- [src/main.ts](src/main.ts)

## Основные файлы по локальным импортам

| Файл | Входящих импортов |
|---|---:|
| [src/dsl/schema.ts](src/dsl/schema.ts) | 9 |
| [src/dsl/parse.ts](src/dsl/parse.ts) | 2 |
| [src/storage/graphs.ts](src/storage/graphs.ts) | 2 |
| [tools/lib/parser.mjs](tools/lib/parser.mjs) | 2 |
| [src/dsl/toFlow.ts](src/dsl/toFlow.ts) | 1 |
| [src/dsl/autoCluster.ts](src/dsl/autoCluster.ts) | 1 |
| [src/dsl/fromFlow.ts](src/dsl/fromFlow.ts) | 1 |
| [src/components/GraphCanvas.vue](src/components/GraphCanvas.vue) | 1 |
| [src/components/DslEditor.vue](src/components/DslEditor.vue) | 1 |
| [src/components/GraphPicker.vue](src/components/GraphPicker.vue) | 1 |
| [src/components/CardsListView.vue](src/components/CardsListView.vue) | 1 |
| [src/assets/theme.css](src/assets/theme.css) | 1 |

## Проверки


## Чтение карты без специальных плагинов

PROJECT_MAP.json — UTF-8 JSON: nodes и edges. Пути файлов относительные. contains обозначает наличие файла; imports_local — статически распознанный импорт; declares_dependency — объявление пакета в манифесте. evidence содержит источник и, где доступно, строку. Карта не исполняет код.

Статус исходного анализа: static-scan-complete; ограничений чтения: 0. Исходный снимок: 2026-10-30T14:47:11.360Z.

После изменения кода перечитайте затронутые файлы: карта является снимком. Отсутствие ребра не доказывает отсутствие зависимости.

# Gazetho API - Endpoints e Contratos

Base path: `/gazetho`

## 1) Criar post

- Método: `POST`
- Path: `/gazetho/posts`

### Request body

```json
{
  "title": "string (obrigatório, max 255)",
  "subtitle": "string (opcional, max 255)",
  "slug": "string (opcional, max 255)",
  "body": "string (obrigatório, max 8000)",
  "mainImage": "string (obrigatório, max 1024)",
  "status": "draft | published (opcional, default draft)",
  "tags": ["string"],
  "relatedGameIds": ["string"],
  "seo": "string (opcional, max 1024)",
  "originalSourceUrl": "url (opcional)",
  "authorId": "string (obrigatório)"
}
```

### Response (201)

Retorna o row criado na tabela `posts` do Appwrite.

## 2) Buscar posts

- Método: `GET`
- Path: `/gazetho/posts`

### Query params

- `q`: string (opcional, max 120)
- `status`: `draft | published` (opcional)
- `authorId`: string (opcional)
- `tag`: string (opcional, max 48)
- `gameId`: string (opcional)
- `page`: number (opcional, min 1, default 1)
- `pageSize`: number (opcional, min 1, max 100, default 12)

### Response (200)

```json
{
  "items": [
    {
      "$id": "string",
      "title": "string",
      "subtitle": "string | null",
      "slug": "string",
      "body": "string",
      "mainImage": "string",
      "status": "draft | published",
      "tags": ["string"],
      "relatedGameIds": ["string"],
      "seo": "string | null",
      "originalSourceUrl": "string | null",
      "author": {
        "$id": "string",
        "name": "string",
        "slug": "string"
      },
      "$createdAt": "ISO date",
      "$updatedAt": "ISO date"
    }
  ],
  "page": 1,
  "pageSize": 12,
  "total": 123,
  "totalPages": 11
}
```

## 3) Buscar post por slug (com jogo relacionado expandido)

- Método: `GET`
- Path: `/gazetho/posts/:slug`

### Path params

- `slug`: string

### Response (200)

```json
{
  "$id": "string",
  "title": "string",
  "subtitle": "string | null",
  "slug": "string",
  "body": "string",
  "mainImage": "string",
  "status": "draft | published",
  "tags": ["string"],
  "relatedGameIds": ["string"],
  "relatedGames": [
    {
      "id": "string",
      "name": "string",
      "slug": "string",
      "coverUrl": "string | null"
    }
  ],
  "seo": "string | null",
  "originalSourceUrl": "string | null",
  "author": {
    "$id": "string",
    "name": "string",
    "slug": "string"
  },
  "$createdAt": "ISO date",
  "$updatedAt": "ISO date"
}
```

### Response (404)

```json
{
  "statusCode": 404,
  "message": "Post com slug \"<slug>\" não encontrado",
  "error": "Not Found"
}
```

## 4) Listar tags mais populares

- Método: `GET`
- Path: `/gazetho/tags/popular`

### Query params

- `limit`: number (opcional, min 1, max 50, default 10)

### Response (200)

```json
{
  "items": [
    {
      "tag": "rpg",
      "count": 12
    },
    {
      "tag": "xbox",
      "count": 9
    }
  ],
  "totalUniqueTags": 37,
  "limit": 10
}
```

## Notas para front-end

- O endpoint de slug agora traz `relatedGames` já expandido com os campos necessários para renderização de card/link: `name`, `slug` e `coverUrl`.
- O campo `relatedGameIds` continua disponível para compatibilidade.
- `coverUrl` pode vir `null` e o front deve ter fallback visual.

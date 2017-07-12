# sjadam-api
API for Sjadam.

# REST Endpoints
Base url: https://api.sjadam.no/

POST /{id} Required fields:
* player_id : string

Join an already created game with {id}.

POST /game Required fields:
* color : string, "w" or "b".
* player_id : string

Creates a new game. Color represents creator player color.

#### __TEMPORARLY :__
GET /game

Returns all games.

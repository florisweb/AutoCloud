# AutoCloud
A simple file-syncing service.

NOTE: MACOS ONLY


## Config (src/config.json)

	{
	  "server": {
	    "port": -,
	    "host": "-",
	    "username": "-",
	    "password": "-",

	    "remoteFolder": "-"
	  }
	}


Issues:

- doesn't do symlinks
- filename may not contain /?
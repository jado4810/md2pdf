all: parse.sh

parse.sh: parser_definition.sh gengetoptions getoptions
	./gengetoptions parser -i2 -f $< parser_definition parse > $@

clean:
	rm -f parse.sh

.PHONY: all clean

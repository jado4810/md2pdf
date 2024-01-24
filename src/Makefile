all: md2pdf.sh

TOOLS = ../third-party/getoptions

parse.sh: parser_definition.sh $(TOOLS)/gengetoptions $(TOOLS)/getoptions
	$(TOOLS)/gengetoptions parser -i2 -f- parser_definition parse < $< > $@

md2pdf.sh: md2pdf.sh.in parse.sh
	sed -e '/%%%INSERT_HERE%%%/r parse.sh' -e '/%%%INSERT_HERE%%%/d' $< > $@

dist: md2pdf.sh
	cp -p $^ ..

clean:
	rm -f md2pdf.sh parse.sh

update: dist clean

.PHONY: all dist clean update

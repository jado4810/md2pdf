all: md2pdf.sh

parse.sh: parser_definition.sh ../third-party/getoptions/gengetoptions ../third-party/getoptions/getoptions
	../third-party/getoptions/gengetoptions parser -i2 -f- parser_definition parse < $< > $@

md2pdf.sh: md2pdf.sh.in parse.sh
	sed -e '/%%%INSERT_HERE%%%/r parse.sh' -e '/%%%INSERT_HERE%%%/d' $< > $@

dist: md2pdf.sh
	cp -p $^ ..

clean:
	rm -f md2pdf.sh parse.sh

update: dist clean

.PHONY: all dist clean update

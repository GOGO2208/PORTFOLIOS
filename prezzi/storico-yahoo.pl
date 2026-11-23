#!/usr/bin/perl
# Una tantum: converte lo storico giornaliero Yahoo (JSON su STDIN) in righe per giornalieri.csv.
# Uso: curl ...chart/EUNL.DE?range=3y&interval=1d | storico-yahoo.pl EUNL >> giornalieri.csv
use strict; use warnings;
my $cod = shift; local $/; my $t = <STDIN>;
my ($ts) = $t =~ /"timestamp":\[([^\]]*)\]/; my ($cl) = $t =~ /"close":\[([^\]]*)\]/; my ($off) = $t =~ /"gmtoffset":(-?\d+)/; $off //= 0;
my @ts = split /,/, $ts; my @cl = split /,/, $cl;
for my $i (0..$#ts) { next if $cl[$i] eq 'null'; my @g = gmtime($ts[$i]+$off); my $d = sprintf('%04d-%02d-%02d',$g[5]+1900,$g[4]+1,$g[3]);
  my $p = sprintf('%.4f',$cl[$i]); $p =~ s/0+$//; $p =~ s/\.$//; print "$d;$d;$cod;$p;yahoo-storico\n"; }

#!/usr/bin/perl
# Estrae data e prezzo da una pagina di quotazione letta su STDIN.
# Uso: parse.pl <yahoo|borsaitaliana|confinvest> <parametro>  →  stampa "AAAA-MM-GG;prezzo", exit 2 se non trovato.
use strict; use warnings;
my ($fonte, $param) = @ARGV;
local $/; my $t = <STDIN> // '';
sub num { my $s = shift; $s =~ s/\.//g; $s =~ s/,/./; return $s }
sub fine { print "$_[0];$_[1]\n"; exit 0 }

if ($fonte eq 'yahoo') {
  my ($ts) = $t =~ /"timestamp":\[([^\]]*)\]/; my ($cl) = $t =~ /"close":\[([^\]]*)\]/;
  my ($off) = $t =~ /"gmtoffset":(-?\d+)/; $off //= 0;
  exit 2 unless $ts && $cl;
  my @ts = split /,/, $ts; my @cl = split /,/, $cl;
  for (my $i = $#cl; $i >= 0; $i--) {
    next if $cl[$i] eq 'null' || $cl[$i] eq '';
    my @g = gmtime($ts[$i] + $off);
    my $p = sprintf('%.4f', $cl[$i]); $p =~ s/0+$//; $p =~ s/\.$//;
    fine(sprintf('%04d-%02d-%02d', $g[5]+1900, $g[4]+1, $g[3]), $p);
  }
  exit 2;
}
$t =~ s/<script.*?<\/script>//gs; $t =~ s/<style.*?<\/style>//gs;
$t =~ s/<[^>]+>/ /g; $t =~ s/&nbsp;/ /g; $t =~ s/&#8217;/'/g; $t =~ s/\s+/ /g;

if ($fonte eq 'borsaitaliana') {
  my ($p) = $t =~ /Prezzo di riferimento\s+([\d.]+,\d+)/;
  ($p) = $t =~ /Prezzo ultimo contratto\s+([\d.]+,\d+)/ unless $p;
  exit 2 unless $p;
  my $d;
  if ($t =~ /Data di riferimento\s+(\d\d)\/(\d\d)\/(\d{4})/) { $d = "$3-$2-$1" }
  elsif ($t =~ /Ultimo Contratto:?\s+(\d\d)\/(\d\d)\/(\d\d)\b/) { $d = "20$3-$2-$1" }
  else { my @g = localtime; $d = sprintf('%04d-%02d-%02d', $g[5]+1900, $g[4]+1, $g[3]) }
  fine($d, num($p));
}
if ($fonte eq 'confinvest') {
  my ($dd,$mm,$yy) = $t =~ /Quotazioni indicative del (\d\d)-(\d\d)-(\d{4})/;
  exit 2 unless $yy;
  my ($den) = $t =~ /\Q$param\E\s+([\d.]+,\d+)\s+[\d.]+,\d+/;
  exit 2 unless $den;
  fine("$yy-$mm-$dd", num($den));
}
exit 2;

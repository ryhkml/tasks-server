with import <nixpkgs> { };

let
  tasksCurl = pkgs.curl.override {
    c-aresSupport = true;
    gsaslSupport = true;
  };
in
pkgs.buildEnv {
  name = "tasks-nix-env";
  paths = [
    tasksCurl
  ];
}

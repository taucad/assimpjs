EMSDK_VERSION="5.0.1"

if [ ! -d "emsdk" ]; then
  eval git clone --recursive https://github.com/emscripten-core/emsdk.git
  cd "emsdk"
  eval ./emsdk install $EMSDK_VERSION
  eval ./emsdk activate $EMSDK_VERSION
  eval source ./emsdk_env.sh
else
  echo "Emscripten already set up!"
  cd "emsdk"
  eval source ./emsdk_env.sh
fi
